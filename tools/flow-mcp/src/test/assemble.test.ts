import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { assembleTrailer, filterPath, probeDuration, totalDuration, xfadeOffsets } from "../assemble.js";

test("xfade: смещения и общая длительность", () => {
  assert.deepEqual(xfadeOffsets([8, 6, 4], 0.5), [7.5, 13]);
  assert.equal(totalDuration([8, 6, 4], 0.5), 17);
  assert.deepEqual(xfadeOffsets([5], 0.5), []);
});

test("filterPath экранирует двоеточие диска и обратные слеши", () => {
  assert.equal(filterPath("C:\\AgroOkno\\a b.ttf"), "'C\\:/AgroOkno/a b.ttf'");
});

test("сборка: два титра с переходом дают ролик нужной длины", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agro-trailer-"));
  try {
    const out = join(dir, "t.mp4");
    const res = await assembleTrailer({
      output: out,
      size: "1080x1920",
      fps: 24,
      transition: 0.5,
      segments: [
        { kind: "title", text: "АгроОкно", subtitle: "Один раз ввёл — везде сдал", duration: 2 },
        { kind: "title", text: "Скачайте: 100%", duration: 1.5, background: "#F8FAFC", color: "#0F172A" },
      ],
    });
    assert.ok(existsSync(out));
    assert.equal(res.duration, 3);
    assert.ok(Math.abs((await probeDuration(out)) - 3) < 0.2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
