import { test, expect } from "@playwright/test";
import {
  desktopRules,
  type DesktopPolicy,
} from "../../apps/admin-web/components/desktop-policy";
import { observeDesktopAudio } from "./helpers/desktop-audio";

const student = {
  id: "s",
  username: "sv001",
  email: "sv@example.test",
  name: "Sinh viên Bình",
  role: "STUDENT",
  status: "ACTIVE",
  created_at: 1,
};
const rules = Object.fromEntries(
  Object.keys(desktopRules).map((key) => [key, true]),
) as DesktopPolicy;

test("user profile filters class history and drills into rounds and a submitted exam", async ({
  page,
}) => {
  const classes = ["COMPLETED", "ONGOING", "UPCOMING"].map((phase, index) => ({
    id: `c${index}`,
    code: `SE0${index}`,
    name: `Lớp ${index}`,
    course_name: "Software",
    teacher_name: "Teacher",
    starts_at: 1791000000,
    ends_at: 1798000000,
    phase,
    membership: "ENROLLED",
    student_number: "001",
  }));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "admin", name: "Admin", role: "ADMIN" };
    if (path.endsWith("/dashboard"))
      json = { courses: 1, exams: 1, sessions: 1, documents: 0 };
    if (path === "/api/admin/users") json = [student];
    if (path.endsWith("/s/profile")) json = { user: student, classes };
    if (path.endsWith("/s/classes/c1"))
      json = {
        user: student,
        class: classes[1],
        rounds: [
          {
            id: "r",
            name: "Giữa kỳ",
            opens_at: 1791000000,
            closes_at: 1791007200,
            sessions: [
              {
                id: "session",
                attempt_number: 1,
                created_at: 1791000100,
                status: "COMPLETED",
                final_score: 8,
              },
            ],
          },
          {
            id: "r2",
            name: "Cuối kỳ",
            opens_at: null,
            closes_at: null,
            sessions: [],
          },
        ],
      };
    if (path === "/api/admin/results/session")
      json = {
        id: "session",
        student_name: student.name,
        exam_name: "Giữa kỳ",
        status: "COMPLETED",
        final_score: 8,
        snapshot: {
          rubric_version: 1,
          ai_provider: "demo",
          knowledge_version: "test",
        },
        attempts: [],
      };
    return route.fulfill({ json });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Người dùng", exact: true }).click();
  await page.getByRole("button", { name: `Chi tiết ${student.name}` }).click();
  await expect(
    page.getByRole("heading", { name: "Thông tin profile" }),
  ).toBeVisible();
  await expect(page.getByText(student.email, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Chi tiết lớp", exact: true }),
  ).toHaveCount(3);
  await page.getByLabel("Thời gian lớp").selectOption("ONGOING");
  await expect(
    page.getByRole("button", { name: "Chi tiết lớp", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Chi tiết lớp", exact: true }).click();
  await expect(page.getByText("Chưa thi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Chi tiết bài thi" }).click();
  await expect(
    page.getByRole("heading", { name: "Giữa kỳ · Lần 1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Giảng viên chấm lại" }),
  ).toBeVisible();
});

test("admin saves independent desktop switches", async ({ page }) => {
  let saved: DesktopPolicy | undefined;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "admin", name: "Admin", role: "ADMIN" };
    if (path.endsWith("/dashboard"))
      json = { courses: 0, exams: 0, sessions: 0, documents: 0 };
    if (path === "/api/admin/settings/platform") json = { ai_provider: "demo" };
    if (path === "/api/admin/settings/desktop") {
      if (route.request().method() === "PUT")
        saved = route.request().postDataJSON();
      json = { version: 1, rules: saved || rules };
    }
    return route.fulfill({ json });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Cấu hình hệ thống", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quy định desktop", exact: true })
    .click();
  await expect(page.getByRole("checkbox")).toHaveCount(10);
  await page
    .getByRole("checkbox", { name: "Bắt buộc camera", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Khóa toàn màn hình (kiosk)", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Lưu quy định desktop" }).click();
  await expect(page.getByText("Đã lưu quy định desktop.")).toBeVisible();
  expect(saved).toEqual({ ...rules, require_camera: false, kiosk: false });
});

for (const pause of [false, true]) {
  test(`audio-only desktop honors focus-loss switch ${pause} and clipboard disabled`, async ({
    page,
  }) => {
    await observeDesktopAudio(page);
    await page.addInitScript(() => {
      let listener: ((type: string) => void) | undefined;
      (window as unknown as { incident: (type: string) => void }).incident = (
        type,
      ) => listener?.(type);
      window.oralDesktop = {
        policyVersion: 1,
        beginExam: async (id) => {
          if (id !== "s") throw new Error("Wrong session");
        },
        endExam: async () => {},
        transcribe: async () => ({ transcript: "Answer", stt_confidence: 1 }),
        onExamEvent: (callback) => {
          listener = callback;
          return () => {
            listener = undefined;
          };
        },
      };
    });
    const policy = {
      ...rules,
      require_camera: false,
      require_screen: false,
      single_display: false,
      block_clipboard: false,
      pause_on_focus_loss: pause,
    };
    const session = {
      id: "s",
      exam_name: "Audio only",
      status: pause ? "DEVICE_CHECK" : "IN_PROGRESS",
      time_limit: 600,
      question_count: 1,
      answered_count: 0,
      started_at: pause ? null : Date.now() / 1000,
      server_time: Date.now() / 1000,
      current_attempt: (pause
        ? null
        : {
            id: "a",
            sequence: 1,
            text: "Explain audio.",
            status: "READY",
          }) as unknown,
      screen_required: false,
      desktop_policy: policy,
      server_processing: true,
    };
    const events: string[] = [];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      let json: unknown = session;
      if (path === "/api/auth/me") json = student;
      if (path === "/api/desktop/policy") json = { version: 1, rules: policy };
      if (path === "/api/exams/available")
        json = [
          {
            id: "e",
            name: "Audio only",
            status: "ASSIGNED",
            time_limit: 600,
            question_count: 1,
          },
        ];
      if (path === "/api/exam-sessions/s/start") {
        session.status = "IN_PROGRESS";
        session.started_at = Date.now() / 1000;
        session.current_attempt = {
          id: "a",
          sequence: 1,
          text: "Explain audio.",
          status: "READY",
        };
      }
      if (path.endsWith("/proctoring-events")) {
        events.push(route.request().postDataJSON().type);
        json = { ok: true };
      }
      return route.fulfill({ json });
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Quy định ứng dụng desktop" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mở bài thi" }).click();
    await expect(
      page.getByRole("combobox", { name: "Camera", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Cho phép microphone" }).click();
    if (pause)
      await page
        .getByRole("button", { name: "Bắt đầu thi", exact: true })
        .click();
    else {
      await expect(
        page.getByRole("button", { name: "Bắt đầu trả lời", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Khôi phục chế độ thi", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Bắt đầu trả lời", exact: true })
      .click();
    const stop = page.getByRole("button", {
      name: "Kết thúc trả lời",
      exact: true,
    });
    await expect(stop).toBeVisible();
    expect(
      await page.evaluate(() =>
        document.dispatchEvent(new Event("paste", { cancelable: true })),
      ),
    ).toBe(true);
    await page.evaluate(() =>
      (window as unknown as { incident: (type: string) => void }).incident(
        "WINDOW_BLUR",
      ),
    );
    await expect.poll(() => events.includes("WINDOW_BLUR")).toBe(true);
    if (pause)
      await expect(
        page.getByRole("button", { name: "Khôi phục chế độ thi", exact: true }),
      ).toBeVisible();
    else {
      await expect(stop).toBeVisible();
      await stop.click();
    }
    const constraints = await page.evaluate(() =>
      (
        window as unknown as {
          desktopAudioProbe: {
            captures: { constraints: MediaStreamConstraints }[];
            recordings: { videoTrackIds: string[] }[];
          };
        }
      ).desktopAudioProbe.captures.map((c) => c.constraints),
    );
    expect(constraints[0].video).toBe(false);
    expect(
      await page.evaluate(() =>
        (
          window as unknown as {
            desktopAudioProbe: { recordings: { videoTrackIds: string[] }[] };
          }
        ).desktopAudioProbe.recordings.map((r) => r.videoTrackIds.length),
      ),
    ).toEqual([0]);
  });
}
