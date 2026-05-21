import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  async create(input: CreateHarnessInput): Promise<Harness> {
    try {
      return await this.prisma.harness.create({
        data: {
          ownerId: input.ownerId,
          name: input.name,
          definition: input.definition as Prisma.InputJsonValue,
          source: input.source,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`harness "${input.name}" already exists for this owner`);
      }
      throw err;
    }
  }

  listByOwner(ownerId: string): Promise<Harness[]> {
    return this.prisma.harness.findMany({
      where: { ownerId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string): Promise<Harness> {
    const row = await this.prisma.harness.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`harness ${id} not found`);
    return row;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
