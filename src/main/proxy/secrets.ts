import { AppError } from '@shared/errors'

/** Cifra segredos antes de gravá-los no banco. */
export interface SecretStore {
  encrypt(plain: string): string
  decrypt(stored: string): string
}

interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

const PREFIX = 'dpapi:'

/**
 * Usa o `safeStorage` do Electron, que no Windows cifra com DPAPI vinculada à
 * conta do usuário: o banco copiado para outro computador ou usuário não revela a senha.
 */
export function electronSecretStore(safeStorage: SafeStorageLike): SecretStore {
  return {
    encrypt(plain) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new AppError('INTERNAL', 'A criptografia do Windows não está disponível para guardar a senha do proxy.')
      }
      return PREFIX + safeStorage.encryptString(plain).toString('base64')
    },
    decrypt(stored) {
      if (!stored.startsWith(PREFIX)) throw new AppError('INTERNAL', 'Senha de proxy em formato desconhecido.')
      try {
        return safeStorage.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'))
      } catch {
        throw new AppError(
          'PROXY_FAILED',
          'Não foi possível ler a senha salva deste proxy (ela foi criada em outra conta do Windows). Edite o proxy e informe a senha novamente.'
        )
      }
    }
  }
}
