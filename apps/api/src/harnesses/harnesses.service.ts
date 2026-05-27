import { Injectable, NotFoundException } from '@nestjs/common';
import { type Harness, type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateHarnessInput {
  ownerId: string;
  name: string;
  definition: unknown;
  source?: string;
}

@Injectable()
export class HarnessesService {
  constructor(private readonly prisma: PrismaService) {}

  // Every save creates a new version row. When the same (ownerId, name)
  // already exists we look up the current latest version and persist
  // `latest + 1` — never updating the existing row. Editor history + run
  // reproducibility both depend on this immutability.
  async create(input: CreateHarnessInput): Promise<Harness> {
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.harness.findFirst({
        where: { ownerId: input.ownerId, name: input.name },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;
      return tx.harness.create({
        data: {
          ownerId: input.ownerId,
          name: input.name,
          version: nextVersion,
          definition: input.definition as Prisma.InputJsonValue,
          source: input.source,
        },
      });
    });
  }

  // Default behavior: only the latest version per (ownerId, name) — the
  // common dashboard list. listByOwner({ latestOnly: false }) returns the
  // full history (used by the editor's history sidebar).
  async listByOwner(ownerId: string, opts: { latestOnly?: boolean } = {}): Promise<Harness[]> {
    const all = await this.prisma.harness.findMany({
      where: { ownerId },
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
      take: 500,
    });
    if (opts.latestOnly === false) return all;
    const seen = new Set<string>();
    const latest: Harness[] = [];
    for (const row of all) {
      if (seen.has(row.name)) continue;
      seen.add(row.name);
      latest.push(row);
    }
    // Match the previous behavior of "most recently updated first" for the
    // dashboard list. orderBy(name) above was just for the dedup window.
    latest.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return latest;
  }

  // Resolves the version a project should run when its defaultHarnessVersion
  // is null. Caller passes the harness id; we look up the latest version with
  // the same (ownerId, name) and return that row.
  async getLatestSibling(harnessId: string): Promise<Harness> {
    const row = await this.prisma.harness.findUnique({ where: { id: harnessId } });
    if (!row) throw new NotFoundException(`harness ${harnessId} not found`);
    const latest = await this.prisma.harness.findFirst({
      where: { ownerId: row.ownerId, name: row.name },
      orderBy: { version: 'desc' },
    });
    return latest ?? row;
  }

  async listVersionsByName(ownerId: string, name: string): Promise<Harness[]> {
    return this.prisma.harness.findMany({
      where: { ownerId, name },
      orderBy: { version: 'desc' },
    });
  }

  async get(id: string): Promise<Harness> {
    const row = await this.prisma.harness.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`harness ${id} not found`);
    return row;
  }
}
