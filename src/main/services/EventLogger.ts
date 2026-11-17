import { desc, lt } from 'drizzle-orm'
import type { EventDTO, EventType } from '@shared/types'
import { profileEvents } from '../db/schema'
import type { Db } from './DatabaseService'

const MAX_EVENTS = 2000

/**
 * Registro de atividade local. As mensagens são montadas pelo próprio aplicativo
 * e nunca contêm cookies, tokens, senhas ou URLs com credenciais.
 */
export class EventLogger {
  private writes = 0

  constructor(private readonly db: Db) {}

  async log(eventType: EventType, message: string, profileId: string | null = null): Promise<void> {
    try {
      await this.db
        .insert(profileEvents)
        .values({ eventType, message: message.slice(0, 300), profileId, createdAt: Date.now() })
      if (++this.writes % 100 === 0) await this.prune()
    } catch (error) {
      // Falha de log nunca pode derrubar a operação principal.
      console.error('[EventLogger] falha ao registrar evento:', (error as Error).message)
    }
  }

  async list(limit: number): Promise<EventDTO[]> {
    const rows = await this.db
      .select()
      .from(profileEvents)
      .orderBy(desc(profileEvents.id))
      .limit(Math.min(Math.max(limit, 1), 200))
    return rows.map((r) => ({ ...r, eventType: r.eventType as EventType }))
  }

  private async prune(): Promise<void> {
    const [newest] = await this.db
      .select({ id: profileEvents.id })
      .from(profileEvents)
      .orderBy(desc(profileEvents.id))
      .limit(1)
    if (newest) await this.db.delete(profileEvents).where(lt(profileEvents.id, newest.id - MAX_EVENTS))
  }
}
