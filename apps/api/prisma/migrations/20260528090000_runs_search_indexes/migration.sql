-- N6 runs search: composite index for harness-filtered recency queries.
CREATE INDEX "HarnessRun_harnessId_startedAt_idx" ON "HarnessRun"("harnessId", "startedAt" DESC);

-- N6 runs search: owner-wide recency scan (filter resolves owner via the
-- project relation, but the planner still benefits from a startedAt index
-- when no narrower filter applies).
CREATE INDEX "HarnessRun_startedAt_idx" ON "HarnessRun"("startedAt" DESC);
