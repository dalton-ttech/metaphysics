import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { V4_CALIBRATION_CLAUSES } from "@/lib/tieban-v4-content";

const root = process.cwd();
const consumerFiles = [
  "src/components/experience-v3.tsx",
  "src/components/experience-v4.tsx",
  "src/lib/tieban-v4-ritual.ts"
];

describe("V5 consumer copy and primary typeface", () => {
  it("keeps product explanations out of the consumer flow", () => {
    const source = consumerFiles.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
    for (const phrase of [
      "不是再问一遍",
      "旧事留下的三枚印",
      "旧事证据尚不能区分相邻刻分",
      "旧事旁证尚不足以分开相邻刻位",
      "数未合，则不启命籍",
      "此条相合",
      "此条不合",
      "先落生辰 · 再起刻数",
      "应期、征兆、变化与所至，四层并录"
    ]) expect(source).not.toContain(phrase);
  });

  it("loads Huiwen Mincho as the primary display and body face", () => {
    const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
    const styles = readFileSync(join(root, "src/app/globals.css"), "utf8");
    expect(layout).toContain("@fontpkg/huiwen-mincho/Huiwen-mincho.otf");
    expect(styles).toContain("--display: var(--font-huiwen-mincho)");
    expect(styles).toContain("--body: var(--font-huiwen-mincho)");
  });

  it("writes every visible clause explanation as direct contemporary Chinese", () => {
    for (const clause of V4_CALIBRATION_CLAUSES) {
      expect(clause.interpretation).not.toMatch(/^所断为/u);
      expect(clause.interpretation).not.toMatch(/本人/u);
      expect(clause.interpretation).not.toMatch(/职业主线|生活主线|原定升学路径|实务训练路径|明显影响功能|亲密关系判断|财务冲击|非自愿职业中断|正式或事实婚姻|正式法律程序/u);
      expect(clause.interpretation).not.toMatch(/进入(?:一次|两次|至少三次)登记结婚|发生(?:一次|两次|至少三次)因外部原因|三十五岁前成年后/u);
      expect(clause.interpretation).not.toMatch(/截至二十四岁|计入的实际手足|全部血缘手足|非血缘家人|去重后|共同生活满五年|累计联系|二十四次|平均每周至少|至少一半的必要开支|礼物与偶尔代付不计|可与照料、供养同时成立/u);
      expect(clause.interpretation).toMatch(/[。！？]$/u);
    }
  });
});
