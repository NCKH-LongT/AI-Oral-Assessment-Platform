export type User = {
  id: string;
  username: string;
  name: string;
  role: "ADMIN" | "TEACHER" | "STUDENT" | "REVIEWER";
};
export type Course = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
};
export type Outcome = {
  id: string;
  code: string;
  description: string;
  weight: number;
};
export type Topic = {
  id: string;
  name: string;
  description: string;
  learning_outcome_id: string;
};
export type Criterion = {
  name: string;
  description: string;
  max_score: number;
  weight: number;
};
export type Rubric = {
  id: string;
  name: string;
  version: number;
  criteria: Criterion[];
};
export type Blueprint = { topic_id: string; difficulty: string; count: number };
export type Exam = {
  id: string;
  name: string;
  status: string;
  time_limit: number;
  blueprint: Blueprint[];
  rubric_id: string;
};
export type Doc = {
  id: string;
  filename: string;
  status: string;
  error: string | null;
  topic_id: string;
};
export type Workspace = {
  outcomes: Outcome[];
  topics: Topic[];
  documents: Doc[];
  rubrics: Rubric[];
  exams: Exam[];
};
export type Result = {
  id: string;
  status: string;
  exam_name: string;
  student_name: string;
  final_score: number | null;
};
export type Chunk = {
  id: string;
  content: string;
  page: number;
  document_id: string;
};
export type Assessment = {
  score: number | null;
  confidence: number;
  review_required: boolean;
  reasoning_summary: string;
  model: string;
  criteria?: { name: string; score: number; comment: string }[];
  retrieved_chunks?: Chunk[];
};
export type Review = Result & {
  snapshot: {
    rubric_version: number;
    knowledge_version: string;
    llm_model: string;
    ai_provider: string;
  };
  attempts: {
    id: string;
    sequence: number;
    status: string;
    question: { text: string };
    transcript: string | null;
    stt_confidence: number | null;
    assessment: Assessment | null;
    evidence: { id: string; kind: string }[];
  }[];
};
export type StudentExam = {
  id: string;
  name: string;
  time_limit: number;
  question_count: number;
  session_id: string | null;
  status: string;
};
export type ExamSession = {
  id: string;
  exam_name: string;
  status: string;
  started_at: number | null;
  time_limit: number;
  server_time: number;
  final_score: number | null;
  question_count: number;
  answered_count: number;
  current_attempt: {
    id: string;
    sequence: number;
    text: string;
    status: string;
  } | null;
};

let refreshing: Promise<Response> | null = null;
export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body && typeof init.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    refreshing ||= fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      refreshing = null;
    });
    if ((await refreshing).ok) return api<T>(path, init, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const fields = body?.error?.details?.fields
      ?.map(
        (f: { field: string; message: string }) => `${f.field}: ${f.message}`,
      )
      .join("; ");
    throw new Error(
      fields || body?.error?.message || `Lỗi kết nối (${response.status})`,
    );
  }
  return response.json();
}
export function send<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  return api<T>(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Có lỗi, vui lòng thử lại";
