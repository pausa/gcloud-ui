import { invoke } from "@tauri-apps/api/core";

export interface JobDetails {
  exit_code: number | null;
  last_run: string | null;
  duration_secs: number | null;
}

export interface JobRow {
  name: string;
  region: string;
  /** Initial run info from "latestCreatedExecution" (no extra gcloud call). */
  details: JobDetails;
}

export async function listJobs(): Promise<JobRow[]> {
  return invoke<JobRow[]>("list_jobs");
}

export async function loadJobDetails(name: string, region: string): Promise<JobDetails> {
  return invoke<JobDetails>("load_job_details", { name, region });
}

export async function openJobInConsole(name: string, region: string): Promise<void> {
  return invoke("open_job_in_console", { name, region });
}

export interface ServiceRow {
  name: string;
  region: string;
  /** Health from the "Ready" condition: true = healthy, false = unhealthy,
   * null = unknown. */
  ready: boolean | null;
}

export async function listServices(): Promise<ServiceRow[]> {
  return invoke<ServiceRow[]>("list_services");
}

export async function redeployService(name: string, region: string): Promise<void> {
  return invoke("redeploy_service", { name, region });
}

export async function openServiceInConsole(name: string, region: string): Promise<void> {
  return invoke("open_service_in_console", { name, region });
}
