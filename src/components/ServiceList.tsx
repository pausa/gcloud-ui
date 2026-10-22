import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import {
  listServices,
  openServiceInConsole,
  redeployService,
  type ServiceRow,
} from "../api";
import { matchesName } from "../filter";

export default function ServiceList() {
  const [services, { refetch }] = createResource(listServices);
  const [filter, setFilter] = createSignal("");
  const [redeploying, setRedeploying] = createSignal<Record<string, boolean>>({});
  const [redeployError, setRedeployError] = createSignal<string | null>(null);

  const key = (svc: ServiceRow) => `${svc.region}/${svc.name}`;

  async function redeploy(svc: ServiceRow) {
    setRedeployError(null);
    setRedeploying((d) => ({ ...d, [key(svc)]: true }));
    try {
      await redeployService(svc.name, svc.region);
    } catch (e) {
      console.error("failed to redeploy service", e);
      setRedeployError(
        `Redeploy of "${svc.name}" failed: ${String(e)}`
      );
    } finally {
      setRedeploying((d) => ({ ...d, [key(svc)]: false }));
    }
  }

  const filtered = createMemo(() => {
    const rows = services() ?? [];
    const f = filter();
    return f.trim() ? rows.filter((r) => matchesName(r.name, f)) : rows;
  });

  return (
    <section class="service-list">
      <div class="toolbar">
        <input
          type="search"
          placeholder="Filter by name…"
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
        <button onClick={() => refetch()}>Refresh</button>
      </div>

      <Show when={redeployError()}>
        {(e) => <p class="error">{e()}</p>}
      </Show>

      <Show when={!services.loading} fallback={<p>Loading services…</p>}>
        <Show
          when={!services.error}
          fallback={<p class="error">Error: {String(services.error)}</p>}
        >
          <table>
            <thead>
              <tr>
                <th>Health</th>
                <th>Name</th>
                <th>Region</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <For each={filtered()}>
                {(svc: ServiceRow) => (
                  <tr>
                    <td>
                      <Show
                        when={svc.ready != null}
                        fallback={<span>unknown</span>}
                      >
                        <span class={svc.ready ? "ok" : "error"}>
                          {svc.ready ? "Ready" : "Error"}
                        </span>
                      </Show>
                    </td>
                    <td>{svc.name}</td>
                    <td>{svc.region || "—"}</td>
                    <td>
                      <button
                        title="Open in Cloud Console"
                        onClick={() =>
                          openServiceInConsole(svc.name, svc.region).catch(
                            (e) =>
                              console.error("failed to open console page", e)
                          )
                        }
                      >
                        Console
                      </button>{" "}
                      <button
                        disabled={redeploying()[key(svc)]}
                        onClick={() => redeploy(svc)}
                      >
                        <Show
                          when={redeploying()[key(svc)]}
                          fallback={<span>Redeploy</span>}
                        >
                          redeploying…
                        </Show>
                      </button>
                    </td>
                  </tr>
                )}
              </For>
              <Show when={filtered().length === 0}>
                <tr>
                  <td colspan="4">No services found.</td>
                </tr>
              </Show>
            </tbody>
          </table>
        </Show>
      </Show>
    </section>
  );
}
