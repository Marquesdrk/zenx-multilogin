import { randomUUID } from 'node:crypto'
import { asc, count, eq } from 'drizzle-orm'
import { AppError } from '@shared/errors'
import { groupInputSchema, type GroupInput } from '@shared/schemas'
import type { GroupDTO } from '@shared/types'
import { groups, profiles } from '../db/schema'
import { assertUuid } from '../paths'
import type { Db } from './DatabaseService'
import type { EventLogger } from './EventLogger'

export class GroupManager {
  constructor(
    private readonly db: Db,
    private readonly events: EventLogger
  ) {}

  async list(): Promise<GroupDTO[]> {
    const rows = await this.db.select().from(groups).orderBy(asc(groups.name))
    const counts = await this.db
      .select({ groupId: profiles.groupId, total: count() })
      .from(profiles)
      .groupBy(profiles.groupId)
    const byGroup = new Map(counts.map((c) => [c.groupId, c.total]))
    return rows.map((g) => ({ ...g, profileCount: byGroup.get(g.id) ?? 0 }))
  }

  async exists(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: groups.id }).from(groups).where(eq(groups.id, id))
    return Boolean(row)
  }

  async create(input: GroupInput): Promise<GroupDTO> {
    const data = groupInputSchema.parse(input)
    const row = { id: randomUUID(), name: data.name, color: data.color, createdAt: Date.now() }
    await this.db.insert(groups).values(row)
    await this.events.log('group_created', `Grupo "${row.name}" criado`)
    return { ...row, profileCount: 0 }
  }

  async update(id: string, input: GroupInput): Promise<GroupDTO> {
    assertUuid(id)
    const data = groupInputSchema.parse(input)
    const [row] = await this.db
      .update(groups)
      .set({ name: data.name, color: data.color })
      .where(eq(groups.id, id))
      .returning()
    if (!row) throw new AppError('NOT_FOUND', 'Grupo não encontrado.')
    const [c] = await this.db.select({ total: count() }).from(profiles).where(eq(profiles.groupId, id))
    return { ...row, profileCount: c?.total ?? 0 }
  }

  /** Remove o grupo. Os perfis associados são mantidos e ficam sem grupo. */
  async delete(id: string): Promise<void> {
    assertUuid(id)
    const [row] = await this.db.select().from(groups).where(eq(groups.id, id))
    if (!row) throw new AppError('NOT_FOUND', 'Grupo não encontrado.')
    await this.db.update(profiles).set({ groupId: null }).where(eq(profiles.groupId, id))
    await this.db.delete(groups).where(eq(groups.id, id))
    await this.events.log('group_deleted', `Grupo "${row.name}" excluído`)
  }
}
