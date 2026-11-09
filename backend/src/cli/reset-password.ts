/**
 * Réinitialisation locale d'un mot de passe : `npm run reset-password -- utilisateur@exemple.com`
 * Génère un mot de passe temporaire, l'affiche une fois et invalide toutes les sessions de l'utilisateur.
 * L'accès physique à la machine fait foi (application strictement locale).
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loadConfig } from '../config/index';
import { openDatabase } from '../database/connection';
import { users } from '../database/schema';
import { setPassword } from '../modules/auth/service';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage : npm run reset-password -- <adresse électronique>');
  process.exit(1);
}
const config = loadConfig();
const conn = openDatabase(config.dbPath);
const user = conn.db.select().from(users).where(eq(users.email, email)).get();
if (!user) {
  console.error(`Aucun utilisateur avec l’adresse ${email} (profil ${config.profile}).`);
  process.exit(1);
}
const temp = `${randomBytes(9).toString('base64url')}7a`;
await setPassword(conn, user.id, temp, null);
conn.sqlite.close();
console.log(`Mot de passe temporaire pour ${user.displayName} : ${temp}`);
console.log('Changez-le dès la prochaine connexion (Paramètres → Mon compte).');
