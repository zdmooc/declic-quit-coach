/**
 * Parcours « Mes données » : sauvegarde dans un fichier, restauration, partage, effacement.
 * Chaque parcours confirme avant toute action destructive et explique les échecs.
 */

import { Alert, Share } from 'react-native';
import type { Declic } from '../../application/declic';
import type { Apercu, Simulation } from '../../application/migration';
import { enregistrerSauvegarde, lireFichierSauvegarde } from '../../adapters/sauvegardeFichier';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function sauvegarder(declic: Declic, maintenant: number): Promise<void> {
  try {
    const jour = new Date(maintenant).toISOString().slice(0, 10);
    const nom = await enregistrerSauvegarde(await declic.exporterDonnees(), `declic-sauvegarde-${jour}.json`);
    if (nom) Alert.alert('Sauvegarde enregistrée', `Fichier « ${nom} ». Garde-le en lieu sûr (Google Drive par exemple).`);
  } catch (e) {
    Alert.alert('Sauvegarde impossible', message(e));
  }
}

/** Choisit un fichier, demande confirmation, puis restaure. `apres` est appelé en cas de succès. */
export async function restaurer(declic: Declic, apres: () => Promise<void>): Promise<void> {
  let texte: string | null;
  try {
    texte = await lireFichierSauvegarde();
  } catch (e) {
    Alert.alert('Lecture impossible', message(e));
    return;
  }
  if (texte === null) return;
  const contenu = texte;
  Alert.alert('Restaurer cette sauvegarde ?', 'Toutes les données actuelles de ce téléphone seront remplacées par celles du fichier.', [
    { text: 'Annuler', style: 'cancel' },
    {
      text: 'Restaurer',
      style: 'destructive',
      onPress: () =>
        void (async () => {
          try {
            const r = await declic.importerDonnees(contenu);
            await apres();
            Alert.alert('Sauvegarde restaurée', `${r.evenements} saisies, ${r.journees} journées avec cigarettes.`);
          } catch (e) {
            Alert.alert('Restauration impossible', `${message(e)}. Tes données actuelles n’ont pas été modifiées.`);
          }
        })(),
    },
  ]);
}

/** Choisit un fichier d'historique et prépare l'aperçu (rien n'est écrit). `null` si annulé. */
export async function preparerImport(declic: Declic): Promise<{ apercu: Apercu; simulation: Simulation } | null> {
  try {
    const texte = await lireFichierSauvegarde();
    if (texte === null) return null;
    const apercu = await declic.apercuImport(texte);
    return { apercu, simulation: await declic.simulerImport(apercu, {}) };
  } catch (e) {
    Alert.alert('Import impossible', message(e));
    return null;
  }
}

export async function partager(declic: Declic): Promise<void> {
  await Share.share({ title: 'Export Déclic', message: await declic.exporterDonnees() });
}

export function effacer(executer: () => void): void {
  Alert.alert('Effacer toutes mes données ?', 'Ton profil, ton historique et ton plan seront supprimés de ce téléphone.', [
    { text: 'Annuler', style: 'cancel' },
    { text: 'Effacer', style: 'destructive', onPress: executer },
  ]);
}
