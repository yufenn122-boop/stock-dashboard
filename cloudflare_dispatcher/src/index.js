const ACTIVE_RUN_STATUSES = new Set([
  "queued",
  "in_progress",
  "pending",
  "requested",
  "waiting",
  "action_required",
]);

// UTC 00:xx → trigger US indices (Beijing 08:xx)
// UTC 07:xx → trigger CN indices (Beijing 15:xx)
function getModeForHour(utcHour) {
  if (utcHour === 0) return "us";
  if (utcHour === 7) return "cn";
  return null;
}

export default {
  async scheduled(controller, env, ctx) {
    const utcHour = new Date(controller.scheduledTime).getUTCHours();
    const mode = getModeForHour(utcHour);
    if (!mode) {
      console.log(`No mode mapped for UTC hour ${utcHour}, skipping.`);
      return;
    }
    ctx.waitUntil(runDispatch(env, "scheduled", mode));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "stock-dashboard-dispatcher" });
    }

    if (url.pathname === "/run" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const mode = body.mode || "all";
      const result = await runDispatch(env, "manual", mode);
      return jsonResponse(result, result.ok ? 200 : 500);
    }

    return jsonResponse({ ok: true, message: "POST /run with {mode: 'us'|'cn'|'all'} to trigger manually." });
  },
};

async function runDispatch(env, triggerSource, mode) {
  const config = getConfig(env);
  const now = new Date();
  const todayKey = toDateKey(now, config.timezone);
  const runs = await listWorkflowRuns(config);
  const todaysRuns = runs.filter(
    (run) => toDateKey(new Date(run.created_at), config.timezone) === todayKey
  );

  // For scheduled triggers, skip if a healthy run already exists today for this mode
  // (manual trigger always dispatches)
  if (triggerSource === "scheduled") {
    const healthyRun = todaysRuns.find((run) => {
      if (ACTIVE_RUN_STATUSES.has(run.status)) return true;
      return run.status === "completed" && run.conclusion === "success";
    });

    if (healthyRun) {
      return {
        ok: true,
        action: "skip",
        reason: "A healthy workflow run for today already exists.",
        triggerSource,
        mode,
        today: todayKey,
        matchedRun: summarizeRun(healthyRun),
      };
    }
  }

  const dispatchResult = await dispatchWorkflow(config, mode);
  return {
    ok: dispatchResult.ok,
    action: "dispatch",
    triggerSource,
    mode,
    today: todayKey,
    dispatchedRef: config.ref,
  };
}

function getConfig(env) {
  const config = {
    githubToken: env.GITHUB_TOKEN,
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO,
    workflowFile: env.GITHUB_WORKFLOW_FILE || "fetch.yml",
    ref: env.GITHUB_REF || "main",
    timezone: env.LOCAL_TIMEZONE || "Asia/Shanghai",
    apiVersion: env.GITHUB_API_VERSION || "2022-11-28",
  };

  for (const [key, value] of Object.entries(config)) {
    if (!value) throw new Error(`Missing required config: ${key}`);
  }

  return config;
}

async function listWorkflowRuns(config) {
  const workflow = encodeURIComponent(config.workflowFile);
  const query = new URLSearchParams({ branch: config.ref, per_page: "20" });
  const response = await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/actions/workflows/${workflow}/runs?${query}`
  );
  return response.workflow_runs || [];
}

async function dispatchWorkflow(config, mode) {
  const workflow = encodeURIComponent(config.workflowFile);
  await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      body: JSON.stringify({ ref: config.ref, inputs: { mode } }),
    }
  );
  return { ok: true };
}

async function githubRequest(config, path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: "GET",
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.githubToken}`,
      "Content-Type": "application/json",
      "User-Agent": "stock-dashboard-dispatcher",
      "X-GitHub-Api-Version": config.apiVersion,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body}`);
  }

  if (response.status === 204) return {};
  return response.json();
}

function toDateKey(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function summarizeRun(run) {
  return {
    id: run.id,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
    html_url: run.html_url,
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
