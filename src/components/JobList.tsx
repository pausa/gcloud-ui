import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { listJobs, loadJobDetails, openJobInConsole, type JobDetails, type JobRow } from "../api";
import { matchesName } from "../filter";

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

  /** Run info for a row: overrides loaded on demand, else the initial
   * details from "latestCreatedExecution". */
  const detailsFor = (job: JobRow): JobDetails => details()[key(job)] ?? job.details;

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
    const f = filter();
    return f.trim() ? rows.filter((r) => matchesName(r.name, f)) : rows;
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
                {(job: JobRow) => {
                  const det = () => detailsFor(job);
                  const override = () => details()[key(job)];
                  return (
                    <tr>
                      <td>{formatTime(det().last_run)}</td>
                      <td>
                        <Show when={det().exit_code != null} fallback={<span>—</span>}>
                          <span class={det().exit_code === 0 ? "ok" : "error"}>
                            {det().exit_code === 0
                              ? "OK (0)"
                              : `error (${det().exit_code})`}
                          </span>
                        </Show>
                      </td>
                      <td>{job.name}</td>
                      <td>{job.region || "—"}</td>
                      <td>{formatDuration(det().duration_secs)}</td>
                      <td>
                        <button
                          title="Open in Cloud Console"
                          onClick={() =>
                            openJobInConsole(job.name, job.region).catch((e) =>
                              console.error("failed to open console page", e)
                            )
                          }
                        >
                          Console
                        </button>{" "}
                        <Show
                          when={override()}
                          fallback={
                            <button onClick={() => loadDetails(job)}>
                              Load run info
                            </button>
                          }
                        >
                          {(o) => (
                            <Show
                              when={o() === "loading"}
                              fallback={
                                <Show when={o() === "error"}>
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
                  );
                }}
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
