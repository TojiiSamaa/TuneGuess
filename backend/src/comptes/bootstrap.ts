import { Db, transaction } from './db';
import { createUser, User } from './accounts';
import { randomToken, sameHash, sha256 } from './secrets';

const KEY = '_bootstrap_code';

const pendingHash = (db: Db) =>
  (db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined)?.value ?? null;

const completeAdmins = (db: Db) =>
  (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND bootstrap = 0 AND disabled = 0").get() as { n: number }).n;

/**
 * Au démarrage : sans administrateur (ou avec ADMIN_BOOTSTRAP_RESET=1), génère un code d'accès
 * à usage unique (160 bits), l'affiche une fois dans les logs et n'en garde que l'empreinte.
 * Retourne le code généré (pour les tests), sinon null.
 */
export function ensureBootstrap(db: Db, opts: { reset?: boolean; log?: (msg: string) => void } = {}): string | null {
  const log = opts.log ?? console.log;
  if (!opts.reset) {
    if (completeAdmins(db) > 0) return null;
    if (pendingHash(db)) {
      log('[admin] Un code d\'amorçage non utilisé existe déjà (voir les logs de son premier affichage). ADMIN_BOOTSTRAP_RESET=1 pour en générer un nouveau.');
      return null;
    }
  }
  const code = randomToken(20);
  db.prepare('INSERT INTO settings (key, value, secret) VALUES (?, ?, 0) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, sha256(code));
  const line = '='.repeat(72);
  log([
    '', line,
    opts.reset ? '  TUNEGUESS : CODE D\'AMORÇAGE ADMIN RÉGÉNÉRÉ (ADMIN_BOOTSTRAP_RESET=1)' : '  TUNEGUESS : CODE D\'AMORÇAGE ADMIN (usage unique)',
    '', `  Code : ${code}`, '',
    '  À saisir sur /admin/amorcage. Il ne sert qu\'une fois, puis la session',
    '  obtenue ne permet que d\'enregistrer une passkey. Il ne sera plus affiché.',
    line, '',
  ].join('\n'));
  return code;
}

/** Consomme le code : un seul usage possible, même si la suite n'aboutit pas. Crée le compte admin. */
export function consumeBootstrapCode(db: Db, code: unknown): User | null {
  if (typeof code !== 'string' || code.length > 100) return null;
  const stored = pendingHash(db);
  const given = sha256(code.trim());
  if (!stored || !sameHash(stored, given)) return null;
  return transaction(db, () => {
    const { changes } = db.prepare('DELETE FROM settings WHERE key = ? AND value = ?').run(KEY, stored);
    if (changes === 0) return null;
    // Un amorçage précédent jamais terminé (aucune passkey) n'a plus de raison d'exister.
    db.prepare('DELETE FROM users WHERE bootstrap = 1 AND id NOT IN (SELECT user_id FROM passkeys)').run();
    return createUser(db, 'Administrateur', { role: 'admin', bootstrap: true });
  });
}

/** Appelé quand la première passkey du compte d'amorçage est enregistrée. */
export function completeBootstrap(db: Db, userId: number): void {
  db.prepare('UPDATE users SET bootstrap = 0 WHERE id = ?').run(userId);
}
