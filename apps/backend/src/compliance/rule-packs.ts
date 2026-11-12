// Paramètres de conformité du planning : un socle légal belge (loi sur le
// travail du 16 mars 1971 et textes liés) et, par commission paritaire, les
// valeurs qui le remplacent. Chaque valeur cite sa source.
//
// ⚠️ À FAIRE VALIDER par un secrétariat social / juriste avant de présenter
// ces contrôles comme « conformes ». Les valeurs marquées `toValidate`
// viennent de sources secondaires ou d'accords sectoriels dont la validité
// actuelle n'a pas été confirmée. Les contrôles sont des AVERTISSEMENTS
// (jamais bloquants) : le planning ne connaît ni le règlement de travail ni
// les dérogations propres à chaque entreprise.

export type SundayRule =
  // Autorisé toute la journée, repos compensatoire dans les 6 jours (art. 16).
  | 'allowed'
  // Commerce de détail sans dérogation : seulement de 8 h à midi (art. 14 §1).
  | 'morning_only';

export interface RuleParams {
  // Limites « normales » (art. 19) : au-delà, seulement si le règlement de
  // travail prévoit un régime dérogatoire -> avertissement.
  dailyNormalMaxHours: number;
  weeklyNormalMaxHours: number;
  // Limites absolues des dérogations (art. 22-26) -> infraction.
  dailyAbsoluteMaxHours: number;
  weeklyAbsoluteMaxHours: number;
  // Repos entre deux journées (art. 38ter) et repos hebdomadaire.
  minDailyRestHours: number;
  minWeeklyRestHours: number;
  // Pause obligatoire au-delà de N heures (art. 38quater ; 15 min sans CCT).
  breakAfterHours: number;
  breakMinutes: number;
  // Durée minimale d'une prestation (3 h, loi du 3 juillet 1978 art. 11bis /
  // durée du travail), et pour un temps partiel si la CP prévoit moins.
  minShiftHours: number;
  minShiftHoursPartTime: number;
  sunday: SundayRule;
  // Travail entre 20 h et 6 h : autorisé dans le secteur, ou à vérifier.
  nightWorkAllowed: boolean;
  // Délai de communication des horaires variables d'un temps partiel, en
  // jours ouvrables (7 depuis le « deal pour l'emploi », 3 minimum par CCT).
  partTimeNoticeWorkingDays: number;
  // Contingent annuel d'heures d'un étudiant.
  studentYearlyHours: number;
}

export interface RulePack {
  code: string;
  label: string;
  params: RuleParams;
  // Paramètres dont la valeur sectorielle reste à confirmer.
  toValidate: (keyof RuleParams)[];
  sources: string[];
}

export const BASELINE: RuleParams = {
  dailyNormalMaxHours: 8,
  weeklyNormalMaxHours: 40,
  dailyAbsoluteMaxHours: 11,
  weeklyAbsoluteMaxHours: 50,
  minDailyRestHours: 11,
  minWeeklyRestHours: 35,
  breakAfterHours: 6,
  breakMinutes: 15,
  minShiftHours: 3,
  minShiftHoursPartTime: 3,
  sunday: 'morning_only',
  nightWorkAllowed: false,
  partTimeNoticeWorkingDays: 7,
  studentYearlyHours: 650,
};

const BASELINE_SOURCES = [
  'Loi du 16 mars 1971 sur le travail (art. 11-16 repos du dimanche, art. 19-26 durée, art. 35-36 nuit, art. 38ter repos, art. 38quater pause)',
  'https://emploi.belgique.be/fr/themes/reglementation-du-travail/duree-du-travail-et-temps-de-repos/duree-du-travail-et-diminution',
  'https://emploi.belgique.be/fr/themes/reglementation-du-travail/duree-du-travail-et-temps-de-repos/repos-du-dimanche',
  'https://emploi.belgique.be/fr/themes/reglementation-du-travail/travail-temps-partiel/travail-temps-partiel-horaires-de-travail',
];

export const RULE_PACKS: RulePack[] = [
  {
    code: '302',
    label: 'CP 302 — Horeca (restaurants, cafés, bars, discothèques)',
    params: {
      ...BASELINE,
      // Dimanche et nuit autorisés dans l'industrie hôtelière (art. 66 ; UCM).
      sunday: 'allowed',
      nightWorkAllowed: true,
      // Temps partiel : prestation minimale de 2 h (UCM, CP 302).
      minShiftHoursPartTime: 2,
      // Délai ramené à 3 jours ouvrables depuis le 01/01/2023 (deal pour l'emploi).
      partTimeNoticeWorkingDays: 3,
    },
    toValidate: ['minShiftHoursPartTime'],
    sources: [
      'https://www.ucm.be/actualites/cp-302-horeca-tour-dhorizon-de-la-duree-du-temps-de-travail',
      'https://www.ucm.be/actualites/delai-de-notification-des-horaires-variables-adaptez-votre-reglement-de-travail-pour-le-20-aout',
    ],
  },
  {
    code: '201',
    label: 'CP 201 — Commerce de détail indépendant',
    params: { ...BASELINE },
    // Dérogations du dimanche (3 + 3 dimanches/an, AR du 3/12/1987 pour
    // certains commerces) et travail de nuit : dépendent du commerce.
    toValidate: ['sunday', 'nightWorkAllowed'],
    sources: ['https://public-search.werk.belgie.be/website-download-service/joint-work-convention/201/201-2023-016140.pdf'],
  },
  {
    code: '202',
    label: 'CP 202 — Commerce alimentaire de détail',
    params: { ...BASELINE },
    // Les commerces alimentaires de moins de 5 travailleurs peuvent ouvrir
    // le dimanche toute la journée (AR du 3/12/1987).
    toValidate: ['sunday', 'nightWorkAllowed'],
    sources: [],
  },
  {
    code: '311',
    label: 'CP 311 — Grandes entreprises de vente au détail',
    params: { ...BASELINE },
    toValidate: ['sunday', 'nightWorkAllowed'],
    sources: [],
  },
  {
    code: '140.03',
    label: 'SCP 140.03 — Transport routier et logistique (livreurs)',
    params: {
      ...BASELINE,
      // Transport : dimanche (art. 66) et nuit autorisés.
      sunday: 'allowed',
      nightWorkAllowed: true,
    },
    // Accord sectoriel 2023-2024 : jusqu'à 12 h/jour si l'horaire
    // hebdomadaire est sous 38 h — validité actuelle non confirmée.
    toValidate: ['dailyAbsoluteMaxHours', 'nightWorkAllowed'],
    sources: [
      'https://employment.belgium.be/sites/default/files/content/documents/International/Fiches%20Limosa/Limosafiche%20PSC%20140.03%20FR.pdf',
      'https://www.monizze.be/wp-content/uploads/2023/10/F-CP-140.03-Protocole-daccord-2023-2024.pdf',
    ],
  },
];

export const JOINT_COMMITTEE_CODES = RULE_PACKS.map((p) => p.code);

// CP inconnue ou non renseignée : socle légal seul.
export function rulePackFor(code: string | null | undefined): RulePack {
  return (
    RULE_PACKS.find((p) => p.code === code) ?? {
      code: 'baseline',
      label: 'Socle légal (commission paritaire non renseignée)',
      params: BASELINE,
      toValidate: [],
      sources: BASELINE_SOURCES,
    }
  );
}

// Moins de 18 ans (SPF Emploi, « Jeunes travailleurs ») : jamais au-delà de
// 8 h/40 h, 12 h de repos, pas de dimanche, pas de nuit.
export const MINOR_RULES = {
  dailyMaxHours: 8,
  weeklyMaxHours: 40,
  minDailyRestHours: 12,
  // Travail de nuit interdit de 20 h à 6 h (16 ans et plus, sauf régimes
  // particuliers jusqu'à 22 h / 23 h) ; minuit-4 h toujours interdit.
  nightStartMinutes: 20 * 60,
  nightEndMinutes: 6 * 60,
  // Pause de 30 min au-delà de 4 h 30, 1 h au-delà de 6 h.
  breakAfterHours: 4.5,
};
