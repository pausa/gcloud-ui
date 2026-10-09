import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { listJobs, loadJobDetails, type JobDetails, type JobRow } from "../api";

function formatDuration(secs: number | null): string {
  if (secs == null) return "—";
  const s = Math.round(secs);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

type DetailsState = JobDetails | "loading" | "error";

export default function JobList() {
  const [jobs, { refetch }] = createResource(listJobs);
  const [filter, setFilter] = createSignal("");
  const [details, setDetails] = createSignal<Record<string, DetailsState>>({});

  const key = (job: JobRow) => `${job.region}/${job.name}`;

  async function loadDetails(job: JobRow) {
    setDetails((d) => ({ ...d, [key(job)]: "loading" }));
    try {
      const det = await loadJobDetails(job.name, job.region);
      setDetails((d) => ({ ...d, [key(job)]: det }));
    } catch (e) {
      console.error("failed to load job details", e);
      setDetails((d) => ({ ...d, [key(job)]: "error" }));
    }
  }

  async function refresh() {
    setDetails({});
    await refetch();
  }

  const filtered = createMemo(() => {
    const rows = jobs() ?? [];
    const f = filter().trim().toLowerCase();
    return f ? rows.filter((r) => r.name.toLowerCase().includes(f)) : rows;
  });

  return (
    <section class="job-list">
      <div class="toolbar">
        <input
          type="search"
          placeholder="Filter by name…"
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
        <button onClick={() => refresh()}>Refresh</button>
      </div>

      <Show when={!jobs.loading} fallback={<p>Loading jobs…</p>}>
        <Show
          when={!jobs.error}
          fallback={<p class="error">Error: {String(jobs.error)}</p>}
        >
          <table>
            <thead>
              <tr>
                <th>Last run</th>
                <th>Exit code</th>
                <th>Name</th>
                <th>Region</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <For each={filtered()}>
                {(job: JobRow) => (
                  <tr>
                    <td>{formatTime(details()[key(job)]?.last_run ?? null)}</td>
                    <td>
                      {(() => {
                        const det = details()[key(job)];
                        return (
                          <Show
                            when={det && det !== "loading" && det !== "error"}
                            fallback={<span>—</span>}
                          >
                            {(d) => (
                              <Show
                                when={d().exit_code != null}
                                fallback={<span>—</span>}
                              >
                                <span class={d().exit_code === 0 ? "ok" : "error"}>
                                  {d().exit_code === 0
                                    ? "OK (0)"
                                    : `error (${d().exit_code})`}
                                </span>
                              </Show>
                            )}
                          </Show>
                        );
                      })()}
                    </td>
                    <td>{job.name}</td>
                    <td>{job.region || "—"}</td>
                    <td>{formatDuration(details()[key(job)]?.duration_secs ?? null)}</td>
                    <td>
                      <Show
                        when={details()[key(job)]}
                        fallback={
                          <button onClick={() => loadDetails(job)}>Load run info</button>
                        }
                      >
                        {(det) => (
                          <Show
                            when={det() === "loading"}
                            fallback={
                              <Show
                                when={det() === "error"}
                                fallback={null}
                              >
                                <button onClick={() => loadDetails(job)}>Retry</button>
                              </Show>
                            }
                          >
                            <span>loading…</span>
                          </Show>
                        )}
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
              <Show when={filtered().length === 0}>
                <tr>
                  <td colspan="6">No jobs found.</td>
                </tr>
              </Show>
            </tbody>
          </table>
        </Show>
      </Show>
    </section>
  );
}
