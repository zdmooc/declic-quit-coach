/**
 * Coach scripté (F6.8, F7.3, F7.4) et garde-fous du coach IA (RM-10, RM-11, F7.5).
 *
 * Les messages sont écrits à l'avance et choisis à partir des données : ils fonctionnent
 * hors ligne et sans IA. Le coach IA, quand il est activé, reçoit seulement le
 * `resumeCoach` (non identifiant, ADR-0005) et passe par les mêmes garde-fous.
 */

import type { TableauDeBord } from './dashboard';
import type { Progres } from './progres';
import { formatEuros } from './savings';

export interface MessageCoach {
  titre: string;
  texte: string;
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** F7.4 : un faux pas (cigarette après l'arrêt) est-il en cours aujourd'hui ? */
export const fauxPasAujourdhui = (tdb: TableauDeBord): boolean =>
  (tdb.phase === 'arret' || tdb.phase === 'maintien') && tdb.fumees > 0;

/** F7.4 : analyse bienveillante d'un faux pas (RM-05, RM-11). */
export function messageFauxPas(tdb: TableauDeBord, p: Progres): MessageCoach {
  const declencheur = tdb.analyse.declencheurs[0]?.libelle;
  return {
    titre: 'Un faux pas n’efface rien',
    texte: [
      `Tu as fumé ${pluriel(tdb.fumees, 'cigarette')} aujourd’hui. Ce n’est pas un échec : la plupart des ex-fumeurs passent par là.`,
      `Ce que tu as construit reste acquis : ${formatEuros(tdb.economieTotaleCents)} économisés et ${pluriel(p.records.cigarettesEvitees, 'cigarette')} évitées.`,
      declencheur
        ? `Ton déclencheur le plus fréquent est « ${declencheur} ». La prochaine fois, prépare une parade pour ce moment-là : marcher 5 minutes, boire un verre d’eau, lancer le SOS.`
        : 'Note le contexte de cette cigarette : c’est ce qui aide à préparer la prochaine fois.',
      'On reprend dès maintenant, sans remettre les compteurs à zéro.',
    ].join('\n\n'),
  };
}

/** F7.3 : bilan du soir, avec l'ajustement proposé pour demain. */
export function messageDuSoir(tdb: TableauDeBord, p: Progres): MessageCoach {
  if (fauxPasAujourdhui(tdb)) return messageFauxPas(tdb, p);
  const declencheur = tdb.analyse.declencheurs[0];
  const heure = tdb.analyse.heuresARisque[0];

  if (tdb.phase === 'observation' || tdb.phase === 'avant-debut') {
    const obs = tdb.observation;
    return {
      titre: 'Ta journée d’observation',
      texte: [
        `${pluriel(tdb.fumees, 'cigarette')} notée${tdb.fumees > 1 ? 's' : ''} aujourd’hui. Continue à fumer normalement et à tout noter : c’est ce qui rendra ton plan juste.`,
        obs ? `Observation : ${obs.joursMesures}/${obs.joursRequis} journées mesurées.` : '',
        declencheur ? `Pour l’instant, ton déclencheur n° 1 est « ${declencheur.libelle} » (${Math.round(declencheur.part * 100)} %).` : '',
        heure ? `Ton heure la plus chargée : ${heure.heure} h.` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    };
  }

  if (tdb.phase === 'arret' || tdb.phase === 'maintien') {
    return {
      titre: 'Une journée sans tabac de plus',
      texte: [
        `${pluriel(p.records.joursSansTabac, 'jour')} sans cigarette. ${formatEuros(tdb.economieTotaleCents)} économisés depuis le début.`,
        heure ? `Demain, sois attentif vers ${heure.heure} h : c’était ton heure la plus chargée.` : '',
        'Si une envie arrive, le bouton SOS est là.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    };
  }

  // Réduction.
  const quota = tdb.quota ?? 0;
  const tenu = tdb.fumees <= quota;
  const demain = Math.max(0, quota - 1);
  return {
    titre: tenu ? 'Quota tenu, bravo' : 'Journée difficile, et c’est normal',
    texte: [
      tenu
        ? `${tdb.fumees} sur ${quota} aujourd’hui${tdb.respect.respectees > 0 ? `, dont ${pluriel(tdb.respect.respectees, 'intervalle')} tenu${tdb.respect.respectees > 1 ? 's' : ''}` : ''}. Tu as économisé ${formatEuros(tdb.economieJourCents)} aujourd’hui.`
        : `${tdb.fumees} pour un quota de ${quota}. Ça arrive : le plan ne recule pas, et demain tu pourras garder le même quota si tu en as besoin.`,
      tenu
        ? demain === 0
          ? 'Demain : ta première journée sans tabac. Prépare-la ce soir : range briquets et cendriers.'
          : `Demain : ${demain} maximum. Une de moins, comme prévu.`
        : declencheur
          ? `Ton déclencheur n° 1 reste « ${declencheur.libelle} ». Demain, prévois une parade pour ce moment-là.`
          : 'Demain, note le contexte de chaque cigarette : on verra mieux où ça coince.',
      tdb.enviesResistees > 0 ? `Et ${pluriel(tdb.enviesResistees, 'envie')} résistée${tdb.enviesResistees > 1 ? 's' : ''} : ça compte autant.` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

/** F6.8 : texte de la notification préventive, avant l'heure à risque. */
export function messagePreventif(tdb: TableauDeBord): MessageCoach | null {
  const heure = tdb.analyse.heuresARisque[0];
  if (!heure) return null;
  const declencheur = tdb.analyse.declencheurs[0];
  return {
    titre: `Bientôt ${heure.heure} h, ton moment sensible`,
    texte: declencheur
      ? `C’est souvent l’heure de « ${declencheur.libelle} ». Prépare ta parade : eau, marche, respiration.`
      : 'C’est souvent là que l’envie arrive. Prépare ta parade : eau, marche, respiration.',
  };
}

/* ------------------------------------------------------------------ */
/* Garde-fous (RM-10, F7.5)                                             */
/* ------------------------------------------------------------------ */

const DETRESSE = [
  'suicid',
  'me tuer',
  'envie de mourir',
  'veux mourir',
  'en finir',
  'plus envie de vivre',
  'me faire du mal',
  'automutil',
  'scarif',
];
const SYMPTOMES = [
  'douleur poitrine',
  'douleur thoracique',
  'mal à la poitrine',
  'mal a la poitrine',
  'palpitation',
  'malaise',
  'évanoui',
  'evanoui',
  'essoufflé',
  'essouffle',
  'du mal à respirer',
  'du mal a respirer',
  'vomi',
  'convulsion',
];
const DOSAGE = ['dose', 'dosage', 'combien de patch', 'combien de pastille', 'combien de gomme', 'mg ', 'milligramme', 'doubler', 'deux patch'];

export type Garde = 'detresse' | 'symptome' | 'dosage';

/** Détecte, avant tout appel à l'IA, un message qui exige une orientation humaine. */
export function garde(texte: string): Garde | null {
  const t = ` ${texte.toLocaleLowerCase('fr-FR')} `;
  if (DETRESSE.some((m) => t.includes(m))) return 'detresse';
  if (SYMPTOMES.some((m) => t.includes(m))) return 'symptome';
  if (DOSAGE.some((m) => t.includes(m))) return 'dosage';
  return null;
}

/** Réponse fixe, jamais générée, quand un garde-fou se déclenche. */
export function reponseGarde(g: Garde): string {
  switch (g) {
    case 'detresse':
      return 'Ce que tu ressens compte, et tu n’as pas à rester seul avec ça. Appelle le 3114 (prévention du suicide, 24 h/24, gratuit) ou le 15. En cas de danger immédiat, le 112. Tu peux aussi en parler à un proche maintenant.';
    case 'symptome':
      return 'Je ne peux pas évaluer un symptôme. Si c’est intense ou inhabituel, appelle le 15 (ou le 112). Sinon, parles-en rapidement à ton médecin ou à ton pharmacien. Tabac Info Service répond aussi au 39 89.';
    case 'dosage':
      return 'Je ne donne pas de conseil de dosage : c’est le rôle de ton médecin, de ton pharmacien ou d’un tabacologue. Tabac Info Service (39 89) peut t’orienter gratuitement. Ce que je peux faire : t’aider à passer l’envie, là, maintenant.';
  }
}

export type ModeCoach = 'sos' | 'soir' | 'fauxpas';

/** Résumé non identifiant envoyé au coach IA : chiffres arrondis, aucun texte libre ni horodatage précis. */
export function resumeCoach(tdb: TableauDeBord, p: Progres): Record<string, string | number | null> {
  return {
    phase: tdb.phase,
    jourDuPlan: tdb.jourDuPlan,
    quotaDuJour: tdb.quota,
    fumeesAujourdhui: tdb.fumees,
    intervallesTenus: tdb.respect.respectees,
    tropTot: tdb.respect.nonRespectees,
    enviesResisteesAujourdhui: tdb.enviesResistees,
    minutesDepuisDerniere: tdb.depuisDerniereMinutes === null ? null : Math.round(tdb.depuisDerniereMinutes / 5) * 5,
    declencheurPrincipal: tdb.analyse.declencheurs[0]?.libelle ?? null,
    heureARisque: tdb.analyse.heuresARisque[0]?.heure ?? null,
    joursSansTabac: p.records.joursSansTabac,
    cigarettesEvitees: p.records.cigarettesEvitees,
    economiesEuros: Math.round(tdb.economieTotaleCents / 100),
    moyenneSemaine: p.bilanSemaine ? Math.round(p.bilanSemaine.moyenneParJour * 10) / 10 : null,
  };
}
