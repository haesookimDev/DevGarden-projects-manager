-- CreateIndex
CREATE UNIQUE INDEX "TodoItem_projectId_sourceType_sourceRef_key" ON "TodoItem"("projectId", "sourceType", "sourceRef");

