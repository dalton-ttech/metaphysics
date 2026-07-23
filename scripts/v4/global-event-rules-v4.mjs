const axisFactId = (axisId, optionKey) => `fact.v4.axis.${axisId}.${optionKey}`;

const rule = ({
  id,
  domain,
  eventIds,
  axisId,
  optionKeys,
  effect = "excluded",
  maxLatestAge = null,
  rationale
}) => ({
  id,
  domain,
  eventIds,
  axisId,
  optionKeys,
  effect,
  maxLatestAge,
  rationale
});

/**
 * Only encode implications that follow from the definitions on both sides.
 * Similar subject matter is not enough: for example, "no purchase" does not
 * rule out selling inherited property, and "no year-long relationship" does
 * not rule out a shorter romance.
 */
export const GLOBAL_EVENT_RULES_V4 = [
  rule({
    id: "family.sibling-existence",
    domain: "family",
    eventIds: ["fam_sibling_duty", "fam_sibling_separation"],
    axisId: "siblings_count",
    optionKeys: ["1", "2", "3p"],
    effect: "required",
    rationale: "手足责任与手足分离均以实际存在至少一名手足为前提。"
  }),
  rule({
    id: "family.no-long-caregiving-before-30",
    domain: "family",
    eventIds: ["fam_caregiving", "turn_care_identity"],
    axisId: "caregiving_duration",
    optionKeys: ["none"],
    maxLatestAge: 29,
    rationale: "三十岁前不存在连续三个月以上照护时，不成立同一时段的长期照护或因照护长期改换身份。"
  }),
  rule({
    id: "family.no-close-loss-before-30",
    domain: "family",
    eventIds: ["fam_elder_loss", "turn_close_death"],
    axisId: "first_close_loss",
    optionKeys: ["none"],
    maxLatestAge: 29,
    rationale: "三十岁前未经历重要亲缘离世时，不成立完全落在该时段内的重要长辈或至亲离世。"
  }),
  rule({
    id: "relationship.no-marriage-before-40",
    domain: "relationship",
    eventIds: ["rel_marriage", "rel_divorce"],
    axisId: "marriage_count",
    optionKeys: ["0"],
    maxLatestAge: 39,
    rationale: "四十岁前未进入正式或事实婚姻时，不成立同一时段内的成婚或婚姻破裂。"
  }),
  rule({
    id: "relationship.no-second-long-relationship-before-40",
    domain: "relationship",
    eventIds: ["rel_remarriage"],
    axisId: "major_relationship_count",
    optionKeys: ["0", "1"],
    maxLatestAge: 39,
    rationale: "再次进入婚姻或长期稳定关系至少需要两段重要关系，长期关系总数不足两段时不成立。"
  }),
  rule({
    id: "relationship.no-year-long-relationship-before-40",
    domain: "relationship",
    eventIds: ["rel_long_distance"],
    axisId: "major_relationship_count",
    optionKeys: ["0"],
    maxLatestAge: 39,
    rationale: "连续一年以上的异地亲密关系属于持续一年以上的重要关系；后者为零时前者不成立。"
  }),
  rule({
    id: "relationship.no-child-rearing-before-45",
    domain: "relationship",
    eventIds: ["turn_child_arrival"],
    axisId: "children_count",
    optionKeys: ["0"],
    maxLatestAge: 44,
    rationale: "子女出生、收养或承担主要养育责任并改变生活结构，应计入子女养育责任。"
  }),
  rule({
    id: "career.no-switch-before-40",
    domain: "career",
    eventIds: ["career_switch"],
    axisId: "career_switch_count",
    optionKeys: ["0"],
    maxLatestAge: 39,
    rationale: "四十岁前职业主线转轨次数为零时，不成立同一时段内的职业转轨。"
  }),
  rule({
    id: "career.no-leadership-before-35",
    domain: "career",
    eventIds: ["career_leadership"],
    axisId: "leadership_level",
    optionKeys: ["none"],
    maxLatestAge: 34,
    rationale: "三十五岁前没有正式管理职责时，不成立完全落在该时段内的正式团队管理或负责人经历。"
  }),
  rule({
    id: "career.no-entrepreneurship-before-40",
    domain: "career",
    eventIds: ["career_entrepreneurship"],
    axisId: "entrepreneurship_count",
    optionKeys: ["0"],
    maxLatestAge: 39,
    rationale: "四十岁前承担主要盈亏的创业次数为零时，不成立同一时段内的创业经历。"
  }),
  rule({
    id: "career.no-involuntary-interruption-before-40",
    domain: "career",
    eventIds: ["career_job_loss"],
    axisId: "job_interruption_count",
    optionKeys: ["0"],
    maxLatestAge: 39,
    rationale: "四十岁前非自愿职业中断次数为零时，不成立同一时段内的裁员、辞退或外因中断。"
  }),
  rule({
    id: "wealth.no-life-changing-shock-before-40",
    domain: "wealth",
    eventIds: ["wealth_bankruptcy", "wealth_debt"],
    axisId: "wealth_shock",
    optionKeys: ["none"],
    maxLatestAge: 39,
    rationale: "破产或持续一年以上且影响生活选择的债务，属于显著改变生活的财务冲击。"
  }),
  rule({
    id: "health.no-treatment-level-accident-before-40",
    domain: "health",
    eventIds: ["health_accident", "health_traffic", "health_fracture", "health_head_face"],
    axisId: "accident_count",
    optionKeys: ["0"],
    maxLatestAge: 39,
    rationale: "需要治疗、检查、缝合或长期休养的意外伤害，应计入严重意外次数。"
  }),
  rule({
    id: "mobility.never-left-before-30",
    domain: "education_mobility",
    eventIds: ["move_left_hometown", "turn_return_home"],
    axisId: "first_leave_hometown",
    optionKeys: ["never"],
    maxLatestAge: 29,
    rationale: "三十岁前未曾长期离开成长地，则同一时段内不成立长期离乡或离乡后的返乡。"
  }),
  rule({
    id: "mobility.no-overseas-stay-before-35",
    domain: "education_mobility",
    eventIds: ["move_overseas"],
    axisId: "overseas_duration",
    optionKeys: ["none"],
    maxLatestAge: 34,
    rationale: "三十五岁前不存在连续三个月以上海外居留，则不存在连续半年以上海外生活。"
  }),
  rule({
    id: "mobility.no-childhood-moves",
    domain: "education_mobility",
    eventIds: ["move_repeated"],
    axisId: "family_moves_18",
    optionKeys: ["0"],
    maxLatestAge: 18,
    rationale: "十八岁前迁居次数为零时，不成立完全落在该时段内的两次以上明显迁居。"
  })
];

export const CAREER_ENTRY_WINDOW_RULE_V4 = {
  id: "career.entry-before-event-window",
  domain: "career",
  eventIds: [
    "career_business_failure",
    "career_entrepreneurship",
    "career_job_loss",
    "career_leadership",
    "career_major_achievement",
    "career_promotion_block",
    "career_public_service",
    "career_switch",
    "career_work_relocation"
  ],
  axisId: "career_entry_age",
  earliestAgeByOption: { by18: 0, "19_22": 19, "23_26": 23, "27p": 27 },
  effect: "excluded_by_window",
  rationale: "职业事件不能早于首次持续工作；只排除其最早可能年龄仍晚于事件窗口终点的选项。"
};

function context(axisId, optionKeys) {
  return {
    kind: "resolved_exclusive_group",
    groupId: `mx.${axisId}`,
    allowedFactIds: optionKeys.map((key) => axisFactId(axisId, key))
  };
}

function sameContext(left, right) {
  return left.groupId === right.groupId
    && left.allowedFactIds.length === right.allowedFactIds.length
    && left.allowedFactIds.every((factId, index) => factId === right.allowedFactIds[index]);
}

function pushContext(list, next) {
  if (next.allowedFactIds.length && !list.some((item) => sameContext(item, next))) list.push(next);
}

export function compileGlobalEventContextsV4(fact) {
  const latestAge = fact.timeWindow?.maxAge ?? Number.POSITIVE_INFINITY;
  const requiredContexts = [...(fact.applicability?.requiredContexts ?? [])];
  const excludedContexts = [...(fact.applicability?.excludedContexts ?? [])];

  for (const item of GLOBAL_EVENT_RULES_V4) {
    if (!item.eventIds.includes(fact.legacyEventId)) continue;
    if (item.maxLatestAge !== null && latestAge > item.maxLatestAge) continue;
    const next = context(item.axisId, item.optionKeys);
    if (item.effect === "required") pushContext(requiredContexts, next);
    else pushContext(excludedContexts, next);
  }

  if (CAREER_ENTRY_WINDOW_RULE_V4.eventIds.includes(fact.legacyEventId)) {
    const incompatibleOptions = Object.entries(CAREER_ENTRY_WINDOW_RULE_V4.earliestAgeByOption)
      .filter(([, earliestAge]) => earliestAge > latestAge)
      .map(([optionKey]) => optionKey);
    pushContext(excludedContexts, context(CAREER_ENTRY_WINDOW_RULE_V4.axisId, incompatibleOptions));
  }

  return { requiredContexts, excludedContexts };
}

export function serializableGlobalEventRulesV4(corpusVersion) {
  return {
    schemaVersion: "1.0.0",
    corpusVersion,
    policy: "strict_logical_implication",
    rules: GLOBAL_EVENT_RULES_V4.map((item) => ({
      ...item,
      context: context(item.axisId, item.optionKeys)
    })),
    dynamicRules: [CAREER_ENTRY_WINDOW_RULE_V4]
  };
}
