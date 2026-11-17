import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator'
import * as schema from '../db/schema'

export type Db = SqliteRemoteDatabase<typeof schema>

/**
 * SQLite local via `node:sqlite` (embutido no Node/Electron, sem módulo nativo
 * externo) com Drizzle ORM. Cria o arquivo no primeiro uso e aplica as migrações.
 */
export class DatabaseService {
  private constructor(
    readonly raw: DatabaseSync,
    readonly db: Db
  ) {}

  static async open(databaseFile: string, migrationsDir: string): Promise<DatabaseService> {
    mkdirSync(dirname(databaseFile), { recursive: true })
    const raw = new DatabaseSync(databaseFile)
    raw.exec('PRAGMA journal_mode = WAL')
    raw.exec('PRAGMA foreign_keys = ON')
    raw.exec('PRAGMA busy_timeout = 5000')

    const db = drizzle(
      async (sql, params, method) => {
        const statement = raw.prepare(sql)
        const args = params as SQLInputValue[]
        if (method === 'run') {
          statement.run(...args)
          return { rows: [] }
        }
        statement.setReturnArrays(true)
        const rows = statement.all(...args) as unknown as unknown[][]
        return { rows: method === 'get' ? (rows[0] as unknown[]) : rows }
      },
      { schema }
    )

    await migrate(
      db,
      async (queries) => {
        raw.exec('BEGIN')
        try {
          for (const query of queries) raw.exec(query)
          raw.exec('COMMIT')
        } catch (error) {
          raw.exec('ROLLBACK')
          throw error
        }
      },
      { migrationsFolder: migrationsDir }
    )
    return new DatabaseService(raw, db)
  }

  close(): void {
    if (this.raw.isOpen) this.raw.close()
  }
}
