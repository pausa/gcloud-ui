import { createSignal, Show } from "solid-js";
import JobList from "./components/JobList";
import ServiceList from "./components/ServiceList";

export default function App() {
  const [tab, setTab] = createSignal<"jobs" | "services">("jobs");

  return (
    <main class="app">
      <h1>Gcloud UI</h1>
      <nav class="tabs">
        <button
          classList={{ active: tab() === "jobs" }}
          onClick={() => setTab("jobs")}
        >
          Jobs
        </button>
        <button
          classList={{ active: tab() === "services" }}
          onClick={() => setTab("services")}
        >
          Services
        </button>
      </nav>
      <Show when={tab() === "jobs"} fallback={<ServiceList />}>
        <JobList />
      </Show>
    </main>
  );
}
