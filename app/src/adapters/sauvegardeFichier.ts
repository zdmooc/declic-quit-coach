/**
 * Sauvegarde dans un fichier choisi par l'utilisateur (Téléchargements, Google Drive…)
 * et restauration depuis un fichier, via le sélecteur système d'Android (expo-file-system,
 * déjà présent dans le build : aucune recompilation).
 */

import { Directory, File } from 'expo-file-system';

/** Écrit la sauvegarde dans un dossier choisi. `null` si l'utilisateur annule. */
export async function enregistrerSauvegarde(contenu: string, nom: string): Promise<string | null> {
  let dossier: Directory;
  try {
    dossier = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (/cancel/i.test(String(e))) return null;
    throw e;
  }
  const fichier = dossier.createFile(nom, 'application/json');
  await fichier.write(contenu);
  return fichier.name ?? nom;
}

/** Lit un fichier de sauvegarde choisi. `null` si l'utilisateur annule. */
export async function lireFichierSauvegarde(): Promise<string | null> {
  const choix = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', 'application/octet-stream'] });
  if (choix.canceled) return null;
  return choix.result.text();
}
