const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function mediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export type ConcernScore = { name: string; score: number; severity: string };
export type ColorSwatch = { role: string; hex: string; label?: string };
export type ReasonItem = { signal: string; direction: string; text: string };
export type EvidenceMeter = {
  key: string;
  label: string;
  score: number;
  tone: string;
  detail: string;
};

export type SkinProfile = {
  session_id: string;
  selfie_url: string;
  undertone: string;
  depth: string;
  contrast: string;
  fitzpatrick?: string;
  skin_age?: number;
  concerns: ConcernScore[];
  palette: ColorSwatch[];
  summary: string;
};

export type Candidate = {
  id: string;
  session_id: string;
  image_url: string;
  category: string;
  label?: string;
  color_features: Record<string, unknown>;
  rule_score: number;
  harmony_score: number;
  preference_score: number;
  final_score: number;
  tier: string;
  reasons: ReasonItem[];
  short_verdict: string;
  verdict_title?: string;
  evidence?: EvidenceMeter[];
  comparison_note?: string;
  rank?: number;
  is_topk: boolean;
  vto_status: string;
  vto_url?: string;
  vto_error?: string;
};

export type Guidance = {
  needed: boolean;
  headline: string;
  tips: string[];
};

export type Session = {
  id: string;
  intent_text: string;
  preference_text: string;
  intent?: {
    occasion?: string;
    formality?: string;
    color_lean?: string;
    vibe?: string;
    constraints?: string[];
    raw_text?: string;
  };
  profile?: SkinProfile;
  candidates: Candidate[];
  comparison_summary?: string;
  guidance?: Guidance;
  events: string[];
};

export type SessionSummary = {
  id: string;
  title: string;
  candidate_count: number;
  has_profile: boolean;
  created_at: string;
  updated_at: string;
};

export async function createSession(): Promise<{ id: string }> {
  return parse(await fetch(`${API_URL}/api/sessions`, { method: "POST" }));
}

export async function listSessions(): Promise<SessionSummary[]> {
  return parse(await fetch(`${API_URL}/api/sessions`));
}

export async function getSession(id: string): Promise<Session> {
  return parse(await fetch(`${API_URL}/api/sessions/${id}`));
}

export async function deleteSession(id: string): Promise<{ deleted: boolean; id: string }> {
  return parse(await fetch(`${API_URL}/api/sessions/${id}`, { method: "DELETE" }));
}

export async function uploadProfile(sessionId: string, file: File): Promise<SkinProfile> {
  const fd = new FormData();
  fd.append("file", file);
  return parse(
    await fetch(`${API_URL}/api/sessions/${sessionId}/profile`, {
      method: "POST",
      body: fd,
    })
  );
}

export async function setIntent(sessionId: string, text: string): Promise<Session> {
  return parse(
    await fetch(`${API_URL}/api/sessions/${sessionId}/intent`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  );
}

export async function setPreference(sessionId: string, text: string): Promise<Session> {
  return parse(
    await fetch(`${API_URL}/api/sessions/${sessionId}/preference`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  );
}

export async function addCandidates(sessionId: string, files: File[]): Promise<Session> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("category", "clothes");
  return parse(
    await fetch(`${API_URL}/api/sessions/${sessionId}/candidates`, {
      method: "POST",
      body: fd,
    })
  );
}

export async function addCroppedCandidate(
  sessionId: string,
  file: File,
  box: { x: number; y: number; width: number; height: number }
): Promise<Session> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("x", String(box.x));
  fd.append("y", String(box.y));
  fd.append("width", String(box.width));
  fd.append("height", String(box.height));
  fd.append("category", "clothes");
  return parse(
    await fetch(`${API_URL}/api/sessions/${sessionId}/candidates/crop`, {
      method: "POST",
      body: fd,
    })
  );
}

export async function analyze(sessionId: string): Promise<Session> {
  return parse(
    await fetch(`${API_URL}/api/sessions/${sessionId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
  );
}

export async function forceVto(sessionId: string, candidateId: string): Promise<Session> {
  return parse(
    await fetch(
      `${API_URL}/api/candidates/${candidateId}/vto?session_id=${encodeURIComponent(sessionId)}`,
      { method: "POST" }
    )
  );
}

export async function deleteCandidate(sessionId: string, candidateId: string): Promise<Session> {
  return parse(
    await fetch(`${API_URL}/api/sessions/${sessionId}/candidates/${candidateId}`, {
      method: "DELETE",
    })
  );
}

export async function seedDemo(sessionId: string, runAnalyze = true): Promise<Session> {
  const q = runAnalyze ? "true" : "false";
  return parse(
    await fetch(`${API_URL}/api/sessions/${sessionId}/demo?run_analyze=${q}`, {
      method: "POST",
    })
  );
}

export async function health(): Promise<{
  status: string;
  youcam: string;
  llm: string;
  supabase?: string;
}> {
  return parse(await fetch(`${API_URL}/api/health`));
}
