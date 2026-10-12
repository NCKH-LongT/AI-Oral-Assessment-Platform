import { test, expect } from "@playwright/test";

test("course vocabulary saves 200 terms, stays separate, and reports limits before writing", async ({
  page,
}) => {
  const courses = [
    {
      id: "cs",
      code: "CS",
      name: "Computing",
      status: "ACTIVE",
      description: "",
    },
    {
      id: "bio",
      code: "BIO",
      name: "Biology",
      status: "ACTIVE",
      description: "",
    },
  ];
  const vocabulary: Record<string, string[]> = { cs: [], bio: ["Mitosis"] };
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = [];
    if (path === "/api/auth/me")
      json = { id: "admin", name: "Admin", role: "ADMIN" };
    else if (path === "/api/admin/courses") json = courses;
    else if (path === "/api/admin/dashboard")
      json = { courses: 2, exams: 0, documents: 0, sessions: 0 };
    else if (path.endsWith("/workspace"))
      json = {
        outcomes: [],
        chapters: [],
        documents: [],
        topics: [],
        rubrics: [],
        exams: [],
      };
    else if (path.endsWith("/hotwords")) {
      const id = path.split("/")[4];
      if (route.request().method() === "PUT") {
        writes.push(id);
        vocabulary[id] = route.request().postDataJSON().hotwords;
      }
      json = { hotwords: vocabulary[id] };
    }
    await route.fulfill({ json });
  });
  const openCourse = async (name: string) => {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "03 · Bài thi & giao bài" }).click();
    await page.getByText("Hotword STT của môn học", { exact: true }).click();
  };
  await page.goto("/");
  await page
    .getByRole("button", { name: "Môn học & đề thi", exact: true })
    .click();
  await openCourse("Computing");
  const input = page.getByLabel("Mỗi dòng một thuật ngữ");
  const save = page.getByRole("button", {
    name: "Lưu hotword môn học",
    exact: true,
  });
  const words = Array.from(
    { length: 200 },
    (_, i) => `Thuật ngữ chuyên ngành ${i}`,
  );
  await input.fill([...words, "", words[0], "   "].join("\n"));
  await expect(page.getByText(/200\/500 thuật ngữ/)).toBeVisible();
  await save.click();
  await expect(
    page.getByText("Đã lưu 200 hotword cho môn Computing."),
  ).toBeVisible();
  expect(vocabulary.cs).toEqual(words);
  expect(vocabulary.bio).toEqual(["Mitosis"]);
  for (const [text, message] of [
    [
      Array.from({ length: 501 }, (_, i) => `term ${i}`).join("\n"),
      "Mỗi môn lưu tối đa 500 thuật ngữ",
    ],
    ["x".repeat(101), "Mỗi thuật ngữ không vượt 100 ký tự"],
    [
      Array.from({ length: 500 }, (_, i) => String(i).padEnd(21, "x")).join(
        "\n",
      ),
      "Tổng hotword của môn học không vượt 10.000 ký tự",
    ],
  ]) {
    await input.fill(text);
    await save.click();
    await expect(
      page.getByRole("alert").filter({ hasText: message }).first(),
    ).toBeVisible();
    expect(writes).toEqual(["cs"]);
  }
  await page.getByRole("button", { name: "Tất cả môn học" }).click();
  await openCourse("Biology");
  await expect(input).toHaveValue("Mitosis");
  await expect(page.getByText(/Đã lưu 200 hotword/)).toHaveCount(0);
  await input.fill("Mitosis\nMeiosis");
  await save.click();
  await expect(
    page.getByText("Đã lưu 2 hotword cho môn Biology."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tất cả môn học" }).click();
  await openCourse("Computing");
  await expect(input).toHaveValue(words.join("\n"));
  expect(writes).toEqual(["cs", "bio"]);
});
