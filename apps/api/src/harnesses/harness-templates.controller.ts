import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { getTemplate, listTemplatesMeta } from '@devgarden/harness-templates';
import { InternalAuthGuard } from '../auth/internal-auth.guard';

/**
 * Catalog of starter harness yaml templates shipped with v0.2 N4.
 *
 *   GET /internal/harness-templates       — list every template's metadata
 *   GET /internal/harness-templates/:id   — fetch one template's full body
 *
 * The web template picker (PR7) calls the list endpoint to render its grid
 * and the by-id endpoint when an operator clicks "Use this template" — the
 * yaml body becomes the editor's initial content.
 */
@Controller('internal/harness-templates')
@UseGuards(InternalAuthGuard)
export class HarnessTemplatesController {
  @Get()
  list() {
    return listTemplatesMeta();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    const template = getTemplate(id);
    if (!template) throw new NotFoundException(`harness template "${id}" not found`);
    return template;
  }
}
