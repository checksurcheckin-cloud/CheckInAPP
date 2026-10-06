# Horaires App — Contexte projet pour Claude Code

## Quoi

SaaS multi-entreprises de gestion des horaires et pointage, pour le marché belge.
Conformité avec l'obligation belge de pointage objectif/fiable/accessible (effective
au 1er janvier 2027, découlant de la jurisprudence CJUE CCOO 2019).

Cible : PME de 20-100 employés par site.

## Les 3 clients front + le backend

- **`apps/backend`** — API NestJS + PostgreSQL (Prisma), sert les 3 clients.
- **`apps/checkin-mobile`** — App mobile (Expo/React Native) unique pour staff ET
  managers. L'UI/navigation s'adapte selon `user.role`. Ne permet PAS la création
  d'horaires (lecture seule des plannings).
- **`apps/checkin-pos`** — App tablette (Expo/React Native), mode kiosk, fixée sur
  le lieu de travail (caisse, vestiaire). C'est le terminal de pointage physique.
  **Ne s'authentifie PAS comme un utilisateur** — s'authentifie comme un
  `SiteDevice` (voir plus bas). Permet : scan (par la caméra de la tablette) du
  QR rotatif affiché sur le téléphone de l'employé, identification par
  badge/NFC, PIN code, enrôlement de nouveaux badges, pairing initial de
  l'appareil et rotation de son `qrSecret`.
- **`apps/web-manager`** — App web (React/Vite), managers uniquement. Seul endroit
  où on peut créer/éditer des horaires (Planning en drag-drop). Propose aussi :
  validation des échanges de shifts (Approvals), présence en direct, gestion de
  l'équipe (dont l'override GPS par employé), gestion des sites (avec
  géocodage d'adresse), réglages entreprise (toggle GPS).

## Décisions d'architecture déjà prises (ne pas reproposer sans raison forte)

1. **Multi-tenant shared-schema** : toutes les tables métier ont un `companyId`.
   Isolation gérée en code (guard + filtrage systématique dans les requêtes
   Prisma), pas par schema Postgres séparé par client. Voir
   `apps/backend/src/auth/tenant-scope.guard.ts` — **RÈGLE CRITIQUE** : toute
   requête Prisma sur une table qui a un `companyId` DOIT filtrer dessus.
   Ne jamais faire `prisma.site.findUnique({ where: { id } })`, toujours
   `prisma.site.findFirst({ where: { id, companyId: user.companyId } })`.

2. **Pointage à 3 modes** (voir enum `TimeEntrySource` dans le schema Prisma) :
   `qr_scan_own_phone`, `badge_scan`, `pin_code`, `gps`, `manual_by_manager`.
   Le pointage ne doit jamais dépendre uniquement du téléphone de l'employé
   (batterie/casse) — badge physique et PIN sont les vrais filets de sécurité,
   pas des options annexes.

3. **Auth à deux modèles différents** :
   - `checkin-mobile` et `web-manager` : auth utilisateur classique (JWT avec
     payload `{ sub: userId, companyId, role }`)
   - `checkin-pos` : auth **appareil**, via `SiteDevice.qrSecret` (rotatif). Pas
     de notion d'utilisateur connecté sur cette app — l'employé s'identifie
     ponctuellement pour créer une entrée dans `time_entries`, sans session.

4. **Horodatage toujours côté serveur**, jamais confiance dans l'heure envoyée
   par le client (exigence légale de fiabilité).

5. **Restriction "création d'horaires = web only"** traitée comme choix produit
   (l'écran n'existe pas côté mobile), pas comme un blocage API — un manager
   reste autorisé par son rôle à créer des shifts, quel que soit le client
   utilisé. Ne pas ajouter de détection "client mobile vs web" côté backend
   sauf décision explicite contraire.

6. **QR rotatif = TOTP (RFC 6238, `otplib`), pas un QR statique.** Le secret
   (`User.qrSecret`) est généré une seule fois côté serveur, à la première
   activation, et n'est jamais transmis au client — seul le code à 6 chiffres
   dérivé l'est. Le téléphone de l'employé (checkin-mobile) affiche ce code
   sous forme de QR qui se régénère toutes les 30s (`PersonalQrCode` +
   `RotatingQrService.generateCode`) ; la tablette (checkin-pos) le scanne et
   renvoie `{ userId, code }` au backend pour vérification
   (`RotatingQrService.verifyCode`), avec une fenêtre de tolérance d'une étape
   pour absorber le décalage d'horloge entre les deux appareils.

7. **Échange de shifts (marché) modélisé par `ShiftOffer`**, distinct de
   `ShiftAssignment` : un employé propose son shift assigné (`offeredBy`), un
   collègue l'accepte (`acceptedBy`), puis un manager valide ou refuse
   (`requiresManagerApproval`, `true` par défaut). Avant toute validation,
   revérifier que le collègue acceptant n'a pas un conflit d'horaire sur ce
   créneau (`ensureNoOverlap`) — c'est un cas légitime de 409, pas un bug, et
   l'UI doit l'afficher clairement plutôt que d'échouer silencieusement (voir
   historique : `ShiftApprovalPage` catchait déjà ce cas correctement une
   fois corrigé).

8. **`ShiftsService.assign()` vérifie la disponibilité déclarée avant
   d'assigner.** Une entrée `Availability` sur une date précise (`specificDate`)
   prime sur une entrée récurrente (`dayOfWeek`) pour ce même jour ; absence
   totale de disponibilité déclarée → **disponible par défaut** (règle
   révisée — voir en fin de décision, l'ancien comportement était
   l'inverse). Si une entrée existe :
   - `isAvailable: true` → le shift doit rentrer entièrement dans
     `startTime`/`endTime` (comportement backend inchangé). Côté écran
     Disponibilités (checkin-mobile), un employé ne peut plus saisir
     d'heures pour "Disponible" — l'écran envoie toujours la sentinelle
     "toute la journée" (`FULL_DAY_START`/`FULL_DAY_END` = `00:00`/`23:59`)
     pour toute nouvelle déclaration. Le check d'heures ci-dessus reste dans
     le backend (générique, pas mort : une ligne existante avec une fenêtre
     plus étroite, ex. import ou ancien jeu de données, doit continuer à
     être respectée) mais n'est plus atteignable via l'app pour un nouveau
     "Disponible" — ne pas réintroduire de saisie d'heures ici sans
     décision produit explicite contraire.
   - `isAvailable: false` → bloque **toute la journée par défaut**. Mais
     `startTime`/`endTime` ne sont plus ignorés : l'employé peut "préciser
     une plage" (écran Disponibilités) au lieu de la sentinelle "toute la
     journée" — mais seulement l'un des deux bords à la fois, pas les
     deux : soit *« à partir de X »* (`startTime: X`, `endTime` = sentinelle
     de fin `23:59`), soit *« jusqu'à Y »* (`startTime` = sentinelle de
     début `00:00`, `endTime: Y`). Un seul champ horaire à saisir, jamais un
     intervalle fermé au milieu de la journée avec les deux bords
     personnalisés — c'est un choix produit (simplicité de saisie), pas une
     limite technique : `ensureAvailable` teste un chevauchement générique
     et accepterait tout aussi bien un intervalle fermé arbitraire. Seul un
     shift qui chevauche la plage ainsi bloquée est rejeté, le reste du jour
     reste assignable. Ne pas contourner cette vérification pour un ajout
     "rapide" de shift, et ne jamais réinterpréter `startTime`/`endTime` sur
     une ligne `isAvailable: true` comme une plage d'indisponibilité (deux
     sens opposés du même champ selon `isAvailable` — voulu, pas une
     incohérence à "corriger").
   - **Révision du défaut "absence de déclaration"** (2026-09-25) : c'était
     à l'origine `bloqué par défaut` (rejet en 409 si aucune ligne
     `Availability` n'existe pour ce jour, ni `specificDate` ni `dayOfWeek`).
     Renversé en `disponible par défaut` (le `if (!availability)` de
     `ensureAvailable` fait maintenant `return` au lieu de `throw`) suite à
     plusieurs incidents en prod (Sophie/Nabil/Eric puis Lucas Petit/dustin
     Mupenda) : la grille planning affiche déjà l'absence de déclaration
     comme `'none'`, une case visuellement libre (décision #14) — avec
     l'ancien défaut, cette case refusait pourtant silencieusement toute
     dépose, sans le moindre indice pour le manager. Un vrai onboarding
     (employé qui ouvre son écran Disponibilités, qui affiche déjà chaque
     jour comme un toggle Disponible/Indisponible) ne reste jamais longtemps
     dans cet état "rien de déclaré" ; le seul cas où ça persiste est un
     compte jamais activé (ex. `status: invited` sans flow d'acceptation
     d'invitation, voir "Connu manquant") ou un jeu de démo incomplet — dans
     les deux cas, bloquer silencieusement n'aidait pas plus qu'être
     assignable par défaut. Ce qui bloque désormais, c'est l'indisponibilité
     *déclarée* (`isAvailable: false`), jamais son absence. Miroir côté
     frontend : `isEmployeeAvailableForShift` (web-manager,
     `lib/availability.ts`) et l'état vide d'`AvailabilitiesScreen`
     (checkin-mobile — un jour jamais déclaré s'affiche maintenant
     "Disponible", pas "Indisponible") ont été alignés sur ce même défaut ;
     l'ancienne logique de `toggleDay` qui "bootstrappait" une disponibilité
     récurrente au premier passage à Disponible sur un jour jamais déclaré
     (pour éviter qu'il reste bloqué indéfiniment) a été supprimée — devenue
     inutile puisque ce jour est déjà disponible par défaut.

9. **GPS clock-in désactivable, à deux niveaux** : `Company.gpsClockInEnabled`
   (réglage par défaut de l'entreprise) et `User.gpsClockInEnabled` nullable
   (override par employé — `null` = hérite du réglage entreprise). Le réglage
   résolu (override employé ?? défaut entreprise) doit être vérifié par
   `TimeEntriesService.createSelf` avant d'accepter un pointage `source: gps` ;
   sinon 403.

10. **Géocodage via Nominatim/OpenStreetMap (pas de clé API), réservé
    admin/manager.** `/geocoding/search` (adresse → coordonnées, utilisé à la
    création/édition d'un site) et `/geocoding/reverse` (coordonnées → adresse
    lisible, utilisé sur les écrans de présence en direct quand un pointage
    GPS existe mais que le site n'a pas de coordonnées déclarées). Le reverse
    geocoding doit rester fail-soft (ne jamais casser l'écran de présence) et
    est mis en cache mémoire (clé = coordonnées arrondies, TTL 1h) pour
    respecter le rate-limit de Nominatim.

11. **Scoping par rôle sur la lecture, pas seulement sur l'écriture** :
    `GET /shifts` ne renvoie à un employé que les shifts où il est assigné
    (filtré dans la requête Prisma elle-même, jamais côté client) ; manager/
    admin voient tout le planning du site. `GET /sites/:id/presence` est
    réservé admin/manager (il expose les coordonnées GPS exactes des collègues)
    et renvoie en plus `source` (méthode de pointage) et
    `distanceFromSiteMeters` (haversine, uniquement pour `source: gps` et un
    site avec coordonnées).

12. **Grille du planning (web-manager, `PlanningPage`) = tableau
    employés x jours, pas une colonne par jour avec les shifts empilés.**
    Structure exacte (voir `PlanningGridCell`, `EmployeeRowHeader`) :
    - 1ère colonne : sélecteur « Semaine »/« Jour » (bascule le nombre de
      colonnes jour affichées, 7 ou 1 — indépendant du toggle Semaine/Mois
      qui reste au-dessus et gère la vue mois séparée) puis une ligne par
      employé (photo ronde = initiales tant qu'il n'y a pas de vraie photo
      de profil dans `User`, nom, total d'heures assignées sur la semaine).
    - Colonnes suivantes : Lundi → Dimanche (`WEEKDAY_LABELS_FR` dans
      `lib/date.ts` — respecter cet ordre, pas celui de `Date.getDay()`).
    - 1ère ligne du corps : « Shifts disponibles », fond vert menthe très
      pâle (`colors.accentTint`), affiche les shifts sans assignation du
      jour concerné.
    - Une carte de shift (`ShiftCard`) = horaire en gras + durée en dessous
      (`formatDurationLabel`), fond pastel très léger et texte assorti,
      couleur parmi 8 teintes (`shiftPalette` dans `ui-tokens`) — voir
      décision #26 pour comment cette couleur est attribuée et pourquoi
      elle n'est plus un simple hash de l'id. Séparations de grille fines,
      gris clair (`colors.border`).
    - Glisser-déposer : toute la carte est la poignée ; on la lâche sur une
      cellule (employé x jour) pour assigner (uniquement si le shift n'a
      pas déjà un titulaire différent — pas de ré-assignation, le backend
      ne l'expose pas) et/ou changer son jour, en une seule dépose
      (`PlanningPage.moveShift`, combine `PATCH /shifts/:id` et
      `POST /shifts/:id/assign`).

13. **Création de shift = modèle sans date d'abord, date au moment de la
    dépose.** Le formulaire « Nouveau shift » ne prend plus que des heures
    (`type="time"`, ex. 16h-20h) : il ne crée pas de `Shift` en base, il
    ajoute un `ShiftTemplate` (`lib/shiftTemplates.ts` — id, startTime,
    endTime, roleNeeded), un concept **purement client**, persisté en
    `localStorage`, jamais envoyé au backend tel quel (le `Shift` Prisma
    exige `startsAt`/`endsAt`, voir schema). Le modèle s'affiche sous le
    formulaire comme une carte réutilisable (`ShiftTemplateCard`, même
    palette pastel que `ShiftCard`) qu'on glisse sur une cellule de la
    grille : `PlanningPage.placeTemplate` combine alors la date de la
    cellule avec les heures du modèle (`combineDateAndTime`,
    `durationMinutesFromTimeRange` — gère le passage à minuit pour un
    shift de nuit) et appelle `POST /shifts` (**`status: 'draft'`**, voir
    décision #15) puis, si déposé sur la ligne d'un employé,
    `POST /shifts/:id/assign`. Le modèle n'est pas consommé par la dépose :
    il reste dans la bibliothèque pour être réutilisé (suppression
    manuelle via le bouton sur la carte).

14. **Indisponibilités affichées dans la grille = seulement les
    déclarations explicites (`Availability.isAvailable: false`), pas
    l'absence de déclaration — et distinguées visuellement selon qu'elles
    couvrent toute la journée ou juste une plage.** Depuis la révision de
    décision #8, l'absence de déclaration est aussi disponible côté backend
    (plus seulement à l'affichage) : `getUnavailabilityInfo` (`'none' |
    'full' | 'from' | 'until'`) et `ShiftsService.ensureAvailable`
    s'accordent enfin sur ce cas, ce qui élimine la classe de bug où une
    case avait l'air libre mais refusait pourtant toute dépose en silence
    (incidents Sophie/Nabil/Eric, Lucas Petit/dustin Mupenda). "Pas encore
    renseigné" continue de ne rien afficher (pas la même chose qu'un refus
    déclaré, et tout marquer pareil noierait la grille — beaucoup de
    créneaux ne sont jamais déclarés dans les données de démo), mais
    maintenant cette case affichée comme libre l'est vraiment.
    - `'full'` (journée entière) : fond plein rose très pâle (`#FEF2F2`) +
      étiquette « Indisponible ».
    - `'from'`/`'until'` (plage partielle, décision #8) : même teinte mais
      en **dégradé horizontal proportionnel** à la portion bloquée de la
      journée (`PlanningGridCell` → `partialGradient`, `lib/date.ts` →
      `fractionOfDay` ; gauche = 00:00, droite = 24:00 — ex. « à partir de
      18h » teinte les 25% de droite de la cellule) + étiquette « Indisponible
      dès/jusqu'à HH:mm » plutôt que le texte générique. Cette mini-timeline
      dans la cellule est le seul indice visuel de la portion bloquée — pas
      de découpage réel de la cellule par créneau.
    - La dépose n'est bloquée que si l'élément réellement glissé chevauche
      la plage indisponible ce jour-là (`PlanningGridCell` recombine
      l'heure de l'élément glissé — `draggedTimeRange`, indépendante de sa
      date d'origine — avec la date de la cellule via
      `isEmployeeAvailableForShift`, décision #16) : une indisponibilité
      partielle ne bloque plus toute la ligne, contrairement à avant. Le
      menu déroulant de secours sur `ShiftCard` applique la même
      vérification précise, voir décision #16.

15. **Workflow brouillon -> assignation -> publication, appliqué côté
    backend et pas juste côté écran.** `Shift.status` par défaut à
    `'draft'` à la création (`CreateShiftDto.status`, déjà le cas côté
    Prisma) ; le manager peut travailler et assigner un brouillon
    librement (il le voit toujours, voir `ShiftsService.findAll`), mais
    **un employé ne voit un shift que s'il est à la fois assigné à lui ET
    `status: 'published'`** — sinon publier ne changerait rien à ce qu'il
    voit sur checkin-mobile. C'est un filtre Prisma dans la requête, pas un
    masquage à l'affichage (même logique que le scoping companyId/rôle,
    décision #11). Côté web-manager : `ShiftCard` affiche une bordure en
    tirets + étiquette « Brouillon » et une action rapide *Publier* par
    carte (icône `Send`) ; `PlanningPage` a en plus un bouton « Publier N
    brouillons » qui publie en une fois tous les brouillons de la semaine
    chargée (`publishAllDrafts`, confirmation via `Dialog`). Ne jamais
    faire dépendre cette visibilité d'une vérification côté client — le
    filtre `status: 'published'` doit rester dans la requête Prisma de
    `findAll`.

16. **Le sélecteur d'assignation d'une carte de shift (`ShiftCard`, repli
    sans glisser-déposer) filtre les employés proposés par disponibilité
    réelle sur l'HEURE du shift, pas juste sur le jour.** Un employé
    indisponible seulement 12h-14h doit rester proposable pour un shift
    16h-20h le même jour — filtrer au jour près (comme le fait la grille
    pour son étiquette « Indisponible », décision #14) aurait exclu à tort
    tous les employés partiellement indisponibles ce jour-là. Voir
    `lib/availability.ts` → `isEmployeeAvailableForShift`, un miroir client
    exact de `ShiftsService.ensureAvailable` (décision #8) : recalculer
    cette règle côté frontend est fragile (double maintenance), mais
    nécessaire ici pour éviter de proposer un choix que le backend
    refuserait de toute façon en 409.

17. **Ce même sélecteur exclut aussi tout employé déjà occupé ce jour-là,
    même sans chevauchement horaire avec CE shift précis** — contrairement
    à la décision #16 (qui ne regarde que la disponibilité déclarée), ici
    c'est un choix produit délibéré : on ne veut pas encourager à donner un
    second shift le même jour à quelqu'un qui en a déjà un, même si les
    horaires ne se chevauchent pas (ex: un shift 08h-12h ne bloque pas pour
    12h-14h côté `ensureNoOverlap`, mais on ne le propose plus quand même
    dans ce sélecteur). `PlanningGridCell` fournit `dayShifts` (tous les
    shifts du jour de la cellule, tous employés, assignés ou non) à chaque
    `ShiftCard`, qui exclut les employés y ayant une assignation active
    (`status !== 'cancelled'`) de la liste proposée. Ne pas confondre avec
    `ensureNoOverlap` côté backend (décision #8), qui reste, lui, au
    chevauchement horaire strict — cette restriction-ci n'existe que côté
    web-manager, pour guider vers de meilleures assignations, pas pour
    empêcher techniquement un second shift le même jour (le glisser-déposer
    direct sur une cellule employé, ou l'API, restent possibles).

18. **La simple bascule Disponible/Indisponible (checkin-mobile,
    `AvailabilitiesScreen`) n'engage QUE le jour affiché — jamais les
    semaines suivantes.** Poser une indisponibilité récurrente (qui vaut
    pour toutes les semaines suivantes) est une action **explicite**,
    réservée au bouton dédié « Rendre récurrente » / « Indisponibilité
    récurrente (toute la journée) » (`applyRecurringFullDayBlock`) —
    jamais une conséquence du toggle. C'est une distinction volontaire de
    mécanisme, pas seulement de mot : plutôt que "permanente" (mot choisi
    par le demandeur, mais ambigu — suggère l'irrévocable), l'écran et ce
    document parlent d'indisponibilité **récurrente**, le terme standard en
    planification pour "se répète chaque semaine".
    - **Bascule (`toggleDay`)** : crée/édite toujours une exception
      ponctuelle (`Availability` avec `specificDate` = la date exacte de
      cette occurrence dans la semaine affichée), jamais l'enregistrement
      `dayOfWeek`. Depuis la révision de décision #8 (absence de déclaration
      = disponible par défaut, plus bloqué), un jour de semaine qui n'a
      jamais rien de déclaré s'affiche déjà "Disponible" sans qu'il faille
      rien créer : l'ancien "bootstrap" (première bascule vers Disponible ->
      création d'un enregistrement `dayOfWeek` récurrent, pour éviter que le
      jour reste bloqué indéfiniment) a été supprimé, devenu inutile. Ne
      recréer QUE l'exception ponctuelle pour marquer Indisponible reste la
      règle ; il n'y a plus de cas particulier au premier passage.
    - **« Rendre récurrente » / « Indisponibilité récurrente (toute la
      journée) »** (`applyRecurringFullDayBlock`) — seul point d'entrée qui
      pose ou renforce un blocage `dayOfWeek` (`isAvailable: false`, journée
      entière). Supprime l'exception ponctuelle du jour affiché si elle
      existait (devenue redondante, la récurrence couvre désormais ce jour
      de toute façon). Visible directement sur l'état « Indisponible »
      plein-jour (à côté de « Préciser une plage horaire »), et comme
      filet de secours dans l'éditeur de plage.
    - **Remettre disponible un jour bloqué par une récurrence ACTIVE**
      (aucune exception ponctuelle en dessous) déclenche une boîte de
      dialogue plutôt qu'une bascule directe, puisque l'action a un impact
      au-delà du jour affiché :
      - **« Garder la récurrence, libérer cette semaine »** — crée une
        exception ponctuelle (`specificDate`, `isAvailable: true`) pour la
        semaine affichée, sans toucher à l'enregistrement `dayOfWeek` :
        repose entièrement sur la précédence déjà existante specificDate >
        dayOfWeek de `resolveAvailability` (frontend) /
        `ShiftsService.ensureAvailable` (backend, décision #8) — **aucun
        changement backend n'a été nécessaire**.
      - **« Annuler la récurrence définitivement »** — repasse directement
        l'enregistrement `dayOfWeek` à `isAvailable: true`, pour toutes les
        semaines.
      Si la bascule touche un jour bloqué par une exception ponctuelle
      seule (pas de récurrence active), c'est un cas simple et scopé au
      jour affiché : la supprimer suffit, pas de dialogue.
    L'éditeur de plage (« Préciser une plage horaire ») et sa sauvegarde
    (`saveEditing`) opèrent sur le même enregistrement que celui qui produit
    l'affichage courant — l'exception ponctuelle si elle existe, sinon la
    récurrence active — jamais l'un à la place de l'autre.

19. **`AvailabilitiesScreen` (checkin-mobile) navigue entre semaines**
    (flèches sous le titre, `weekStart` en state au lieu d'un `useMemo` figé
    au montage) — nécessaire pour que la décision #18 ait un sens : sans
    navigation, il n'y avait qu'une seule semaine à voir, donc rien à
    distinguer entre "ce jour est indisponible cette semaine" et "il l'est
    de façon récurrente". `weekDates` (7 jours dérivés de `weekStart`) et
    `overrideForDay` (exceptions ponctuelles de la semaine affichée) se
    recalculent avec la semaine courante — `toggleDay` et
    `keepRecurringButFreeThisWeek` (décision #18) opèrent donc sur la
    semaine *affichée*, pas nécessairement la semaine réelle actuelle.
    Deux signes distinctifs accompagnent cette navigation, pour qu'un
    employé qui parcourt les semaines suivantes comprenne d'où vient ce
    qu'il voit sans avoir à deviner :
    - **Badge répétition** (icône `repeat`, à côté de « Indisponible ») —
      affiché quand l'indisponibilité vient de la récurrence et s'applique
      bien cette semaine (pas masquée par une exception ponctuelle).
      Répond directement au besoin : confirmer que « l'indisponibilité
      récurrente a bien été appliquée » — par opposition à une
      indisponibilité qui ne concerne que le jour affiché (pas de badge).
    - **« Exception cette semaine »** (sous « Disponible ») — cas inverse :
      une récurrence existe mais est mise en pause cette semaine par une
      exception ponctuelle active ; sans ce texte, « Disponible » seul
      aurait pu laisser croire que la récurrence avait été annulée pour de
      bon.
    Aucun changement backend : ces deux indicateurs ne font que lire l'état
    déjà renvoyé par `GET /availabilities` (recurring vs override), calculé
    côté client (`isRecurringApplied` / `isRecurringPaused`).

20. **`GET /shift-offers` est le SEUL endroit où un employé voit des shifts
    qui ne sont pas les siens.** `GET /shifts` ne renvoie jamais que les
    shifts de l'appelant pour un employé (`assignments: { some: { userId }
    }`, décision #11) — dériver les offres ouvertes des collègues à partir
    de `getShifts()` (comme le faisait initialement l'écran
    `ShiftMarketplaceScreen`) ne pouvait donc structurellement jamais rien
    trouver : un employé ne recevait toujours que *ses propres* offres.
    `ShiftsService.listOpenOffers(companyId, requesterId)` interroge
    directement `ShiftOffer` (`status: 'open'`, `offeredBy: { not:
    requesterId }`, scopé à l'entreprise via `shiftAssignment.shift.site`)
    et renvoie une forme aplatie dédiée (`OpenShiftOffer` dans
    `shared-types` : `{ id, shiftId, shift, offeredBy, createdAt }`) plutôt
    que des `Shift[]` imbriqués — plus simple à consommer côté écran que de
    refouiller des `assignments[].offers[]`. Portée volontairement étroite :
    uniquement les offres encore ouvertes, jamais le planning complet d'un
    collègue — ne pas élargir ce filtre sans décision produit explicite.
    L'écran fait deux appels distincts : `getShifts()` pour « Mes
    échanges » (shifts propres, inchangé), `getOpenShiftOffers()`
    (`GET /shift-offers`) pour « Disponibles ».
    *Note historique* : ce bug a été corrigé indépendamment par deux
    sessions Claude Code en parallèle sur ce dépôt (deux implémentations
    quasi identiques poussées à quelques minutes d'écart) — la seconde à
    pousser a dû fusionner manuellement les deux ; c'est la version
    `listOpenOffers`/`OpenShiftOffer` ci-dessus qui a été retenue.

21. **`ShiftsService.ensureAvailable` compare les horaires dans le fuseau du
    SITE, jamais en UTC brut.** Un `Shift` est stocké en UTC, mais les
    heures `HH:mm` d'une `Availability` et son `dayOfWeek` sont déclarés en
    heure locale du site — les comparer sans conversion décale tout d'1 à 2h
    selon l'heure d'été/hiver (un shift 09:00 locale à Bruxelles est 07:00Z
    l'été : comparé tel quel à une dispo "08:00-16:00", il semblait
    commencer AVANT l'ouverture). `assign()` charge le fuseau du site
    (`Site.timezone`, défaut `Europe/Brussels`) et `ensureAvailable`
    décompose chaque borne via `Intl.DateTimeFormat` (`zonedParts`) en
    année/mois/jour/jour-de-semaine/minutes-du-jour LOCAUX avant toute
    comparaison — jamais de `Date` UTC comparées directement à une chaîne
    `HH:mm`. Un shift de nuit dont la fin tombe le lendemain en heure locale
    voit sa fin exprimée sur une échelle > 24h (`shiftEndMinutes = fin +
    joursDeDécalage × 1440`) plutôt que rembobinée à minuit — sans ça, un
    22h-06h locale se ferait comparer une fin "avant" son propre début.
    Cette conversion est partagée par les deux branches de la fonction
    (fenêtre disponible ET plage d'indisponibilité partielle, décision #8) :
    ne jamais réintroduire une comparaison sur les `Date` UTC brutes du
    shift dans l'une des deux sans l'autre, elles doivent rester cohérentes.

22. **Le marché de shifts accepte plusieurs candidats par offre — le manager
    choisit lequel approuver, le shift ne quitte le planning de son
    propriétaire d'origine qu'à ce moment-là.** Avant cette décision, une
    seule personne pouvait "accepter" une offre (`ShiftOffer.acceptedBy`,
    champ unique) : la première à cliquer verrouillait l'offre pour tout le
    monde. Nouveau modèle :
    - `ShiftOfferCandidate` (nouvelle table, `@@unique([offerId, userId])`)
      enregistre chaque candidature — plusieurs lignes possibles pour la
      même offre. `ShiftsService.acceptOffer` (endpoint
      `POST /shift-offers/:id/accept`, toujours ce nom pour l'API, mais
      c'est désormais une candidature, pas une finalisation) se contente d'y
      ajouter une ligne : **ni `ShiftOffer.status` ni
      `ShiftAssignment.status` ne changent tant qu'aucun choix n'est fait**
      — le shift reste `offered`, visible et attribué à son propriétaire
      d'origine dans son planning (`GET /shifts`, web-manager comme
      checkin-mobile) exactement comme avant qu'il ne le propose. Les
      statuts `swap_pending` (assignation) et `accepted` (offre) de l'ancien
      flux à candidat unique restent dans les enums Prisma/TS pour ne pas
      casser une migration à froid, mais **le nouveau code ne les produit
      plus jamais** — ne pas s'étonner qu'ils soient orphelins.
    - `ShiftsService.approveOffer(companyId, offerId, { userId })` prend
      maintenant l'id du candidat choisi (nouveau `ApproveShiftOfferDto`) :
      transfère l'assignation à CE candidat précis, revérifie son absence de
      chevauchement (l'état a pu changer depuis sa candidature), clôt
      l'offre, et **supprime les autres candidatures** (`deleteMany`,
      devenues sans objet). `rejectOffer` fait de même sans choisir
      personne : l'assignation revient au propriétaire d'origine, toutes
      les candidatures sont effacées.
    - `GET /shift-offers/pending` (nouveau, `listPendingOffersForManager`,
      admin/manager) alimente la page "Échanges à valider"
      (web-manager `ShiftApprovalPage`, checkin-mobile
      `ShiftApprovalScreen`) : **toutes** les offres encore ouvertes de
      l'entreprise, candidatures comprises — y compris celles à zéro
      candidat, pour que le manager voie ce qui traîne sans preneur sur le
      marché, pas seulement ce qui est prêt à valider. Le manager choisit
      parmi les candidats (menu déroulant web, chips tapables mobile) avant
      de valider ; sans candidat, seul "Retirer" (rejectOffer) est possible.
    - `GET /shift-offers` (marché employé, `listOpenOffers`) renvoie en
      plus `hasApplied` (l'appelant a-t-il déjà candidaté sur cette offre)
      pour que le bouton "Candidater" du marché (checkin-mobile
      `ShiftMarketplaceScreen`, renommé — "Accepter" n'était plus honnête,
      candidater ne finalise plus rien) se désactive après une candidature
      plutôt que de proposer un second clic sans effet visible.

23. **Mises à jour en temps réel via un unique gateway WebSocket
    (`apps/backend/src/realtime`), pas de payload fusionné côté client.**
    - `RealtimeGateway` (socket.io, `@nestjs/websockets` +
      `@nestjs/platform-socket.io`) authentifie chaque connexion au handshake
      avec le même JWT que les requêtes HTTP (`socket.auth.token`), puis
      rejoint le client à une room `company:${companyId}` — aucune autre
      room, même isolement multi-tenant que le reste de l'API (décision #1).
      Un token absent/invalide déconnecte immédiatement le socket.
      `RealtimeModule` est `@Global()` : n'importe quel service injecte
      `RealtimeGateway` sans réimport, un seul canal pour toute l'app.
    - **checkin-pos n'y participe pas** : c'est un terminal mono-tâche
      (pointage), sans écran multi-viewer à tenir à jour en direct.
    - Événements volontairement grossiers — `shifts:changed`,
      `time-entries:changed`, `availabilities:changed` — sans payload
      exploitable (`{}`). Chaque écran réagit en rappelant sa fonction
      `load()` existante (le même chemin que le pull-to-refresh) plutôt que
      de fusionner un état partiel : plus simple, et chaque écran consomme
      déjà ces données sous une forme différente (shift imbriqué dans une
      grille, présence aplatie, etc.) — fusionner aurait dupliqué cette
      logique de mise en forme à chaque écran.
    - Émis par `ShiftsService` (`offerAssignment`, `acceptOffer`,
      `approveOffer`, `rejectOffer`), `TimeEntriesService` (les 4 chemins de
      pointage + update), `AvailabilitiesService` (create, update, remove) —
      toujours juste avant le `return`, jamais avant que la transaction
      Prisma ait committé.
    - **Exception délibérée dans `ShiftsService` : `create`, `update` (sauf
      passage à `published`), `remove` et `assign` n'émettent PAS
      `shifts:changed`.** Construire le planning (créer un brouillon,
      l'assigner en glisser-déposer, ajuster ses horaires, le supprimer) est
      un travail de préparation, invisible de toute façon pour un employé
      tant que le shift reste `draft` (décision #15) — rafraîchir en direct
      l'écran des AUTRES managers à chaque geste de préparation ne fait que
      perturber leur propre glisser-déposer en cours, pour un bénéfice nul
      tant que rien n'est publié. Seul le vrai passage à `status:
      'published'` dans `update()` (bouton *Publier* d'une carte, "Publier N
      brouillons", ou l'éditeur générique de shift) déclenche l'émission :
      c'est le seul moment où le contenu change réellement pour quelqu'un
      d'autre. Ne pas réintroduire d'émission sur les autres branches de ces
      méthodes sans revenir sur ce choix produit explicite. Les mutations du
      marché d'échange (`offerAssignment`/`acceptOffer`/`approveOffer`/
      `rejectOffer`) restent inchangées : ce n'est pas de la préparation de
      planning, la page "Échanges à valider" doit rester réactive en direct.
    - Côté front, `packages/api-client/src/realtime.ts` expose
      `connectRealtime(baseUrl, token)` (force `transports: ['websocket']`,
      plus fiable que le long-polling XHR sur React Native). Les deux
      `AuthService.tsx` (web-manager, checkin-mobile) ouvrent la connexion
      dès qu'un `user` est authentifié (login ou session restaurée) et la
      ferment au logout ; le socket est exposé via `useAuth().socket`.
    - `PresenceLivePage`/`PresenceLiveScreen` gardent leur polling existant
      (30s web, aucun avant côté mobile) **en filet de sécurité** — le
      websocket accélère juste le rafraîchissement, il ne le remplace pas.

24. **Une ligne `Availability` avec `isAvailable: true` doit toujours être
    "toute la journée" (`00:00`/`23:59`) en pratique — ne plus jamais générer
    de fenêtre restreinte pour `isAvailable: true`, y compris dans le seed.**
    Bug remonté en prod (Nabil Amrani mardi, Eric Employé jeudi) : le jeu de
    données seed créait des lignes `isAvailable: true` avec de vraies heures
    (ex. `08:00-17:00`, avant la simplification de décision #8) ; côté
    mobile, `AvailabilitiesScreen` affiche `isAvailable: true` comme
    "Disponible" plein et simple, **sans jamais montrer ni permettre
    d'éditer ces heures** — donc rien sur le téléphone n'indiquait la
    restriction. Mais `ShiftsService.assign`/`isEmployeeAvailableForShift`
    (décision #8) continuaient à l'appliquer à la lettre, rejetant en
    silence toute dépose qui dépassait cette fenêtre invisible : une case
    visuellement libre (aucune étiquette dans la grille, décision #14) qui
    refusait pourtant l'assignation, sans le moindre message. Un premier
    correctif purement visuel (afficher la fenêtre dans la grille) a été
    tenté puis **annulé** : le seed générait une fenêtre restreinte sur
    quasi tous les jours "Disponible" des 5 premiers employés, donc l'ajout
    aurait couvert la majorité de la grille de dégradés rouges — bruyant, et
    ça ne réglait pas le vrai problème (le mobile continuait de ne rien
    montrer de cohérent avec ça).
    - **Correction appliquée** : toutes les lignes `isAvailable: true`
      existantes en base (prod comprise) ont été normalisées à
      `startTime: '00:00'`/`endTime: '23:59'` — un nettoyage de données, pas
      un changement de logique. Les lignes `isAvailable: false` n'ont pas
      été touchées (leurs plages, pleines ou à un bord, restent des
      indisponibilités réellement déclarables et affichées, décision #14).
    - **`seed.ts` corrigé en conséquence** : les lignes générées avec
      `isAvailable: true` sont désormais toujours `00:00`-`23:59` ; seules
      les lignes `isAvailable: false` gardent de la variété (journée entière,
      ou un seul bord personnalisé — `'from'`/`'until'`, jamais les deux,
      voir décision #8) pour continuer à exercer l'affichage partiel de la
      grille. Ne pas réintroduire d'heures précises pour `isAvailable: true`
      dans le seed sans revenir sur ce choix.
    - Le check d'heures dans `ensureAvailable`/`isEmployeeAvailableForShift`
      pour la branche `isAvailable: true` (décision #8) reste dans le code —
      ce n'est pas mort, une ligne créée hors de l'app (import, appel API
      direct) pourrait encore l'exercer légitimement — mais aucune donnée
      vivante générée par l'app ou le seed ne doit plus jamais en produire.

25. **`User.siteId` (nullable) rattache un employé à UN site — scoping
    affichage seulement, pas d'application backend stricte pour l'instant.**
    Avant cette décision, `User` n'avait aucun lien vers `Site` : `GET
    /users` renvoyait tout l'annuaire de l'entreprise sans distinction, donc
    le même employé apparaissait sur la grille planning de TOUS les sites,
    assignable n'importe où — signalé par l'utilisateur ("comment se fait-il
    que tous les employés soient liés aux deux sites").
    - **Nullable, jamais obligatoire** : `siteId: null` = pas encore
      rattaché, reste visible sur TOUS les sites (même philosophie que
      l'absence de déclaration de disponibilité, décision #14 — ne pas
      confondre "pas assigné" avec "exclu partout"). Pas de backfill sur les
      employés existants : ils restent `null` jusqu'à assignation manuelle
      via la page Équipe.
    - **`onDelete: SetNull`** sur `User.site` : supprimer un site libère ses
      employés plutôt que de bloquer la suppression (contrairement à
      `Shift`/`TimeEntry`/`SiteDevice`, qui sont les données opérationnelles
      réelles du site et n'ont pas cette clause).
    - **Scoping affichage seulement, choix produit explicite** :
      `UsersService.findAll(companyId, siteId?)` filtre l'annuaire quand
      `GET /users?siteId=` est fourni (`OR: [{siteId}, {siteId: null},
      {role: {not: 'employee'}}]` — un employé sans site OU un manager/admin
      passe toujours le filtre, les managers supervisant tous les sites de
      l'entreprise sans notion de rattachement). `ShiftsService.assign()`
      **n'a pas changé** : un manager reste techniquement libre d'assigner
      un employé à un shift d'un site qui n'est pas le sien — pas de 409 sur
      un mismatch site/employé. web-manager `PlanningPage` filtre
      `employees` côté client avec la même règle (pas de nouvel appel réseau
      au changement de site sélectionné, la liste complète est déjà chargée).
      Si un vrai cloisonnement métier devient nécessaire (ex. présence,
      assignation), ce sera une décision produit séparée et explicite — ne
      pas l'ajouter par extension silencieuse de cette décision-ci.
    - **`UsersService.ensureSiteInCompany`** revalide systématiquement
      qu'un `siteId` fourni par le client (invite, `PATCH
      /users/:id/settings`) appartient bien à `companyId` avant de l'écrire
      — règle critique décision #1, jamais faire confiance à un id de site
      fourni tel quel.
    - Page Équipe (web-manager `TeamPage`) : nouveau sélecteur "Site" par
      ligne employé (même pattern que la surcharge GPS existante — valeur
      vide = aucun site), + sélecteur de site dans le formulaire d'invitation.
      Les rôles manager/admin n'ont pas de sélecteur (juste "Tous les
      sites") puisque le filtre ne les exclut jamais de toute façon.
    - Seed : les 8 employés de démo sont répartis en alternance entre les 2
      sites, un sur trois laissé `null`, pour que la démo illustre les deux
      cas (rattaché / pas encore rattaché) sans configuration manuelle.
      `upsert(... update: {})` : un reseed ne réécrase jamais le site d'un
      employé déjà en base.
    - *Bug latent corrigé au passage* : le nettoyage du seed
      (`shiftOffer.deleteMany`) ne supprimait pas d'abord les
      `ShiftOfferCandidate` qui référencent l'offre (modèle ajouté par la
      décision #22, après l'écriture de cette section du seed) — un reseed
      sur une base ayant déjà des candidatures plantait sur une violation de
      contrainte FK. `shiftOfferCandidate.deleteMany` ajouté juste avant.

26. **Couleur d'un shift = mémorisée par id (localStorage), jamais un hash
    recalculé — web-manager uniquement.** Avant cette décision,
    `getShiftPalette(shift.id)` dérivait la couleur d'un hash déterministe
    de l'id parmi 4 teintes : stable dans le temps, mais deux shifts du
    même jour pouvaient coïncider sur la même couleur même à faible nombre
    (peu de teintes, hash non garanti sans collision). `shiftPalette`
    (`ui-tokens`) est passé à 8 teintes (ajout vert/ambre/cyan/indigo, même
    famille de ton que les 4 d'origine) et `lib/shiftColor.ts`
    (`resolveShiftColors`) remplace le hash par un index mémorisé en
    `localStorage` (`horaires:shift-colors`, id -> index) :
    - Un shift déjà vu garde exactement le même index pour toujours (pas de
      recalcul au reload, ni s'il change de jour ensuite).
    - Un shift jamais vu reçoit la plus petite teinte encore libre PARMI LES
      AUTRES SHIFTS DU MÊME JOUR (regroupement par `toDateString()`) —
      garanti sans collision tant qu'il y a moins de 9 shifts ce jour-là.
      Au-delà, une répétition devient inévitable (8 teintes, nombre fini).
    - Un shift créé depuis un modèle (`PlanningPage.placeTemplate`) hérite
      directement de la couleur DE CE MODÈLE (`assignInheritedShiftColor`,
      appelé juste après la création) au lieu de se voir attribuer une
      teinte via la règle ci-dessus — la carte du planning et la carte du
      modèle dont elle vient restent visuellement la même dès le dépôt.
    - `ShiftCard`/`PlanningGridCell` reçoivent la couleur déjà résolue en
      prop (`getShiftPalette`, calculé une fois dans `PlanningPage` via
      `useMemo`/`useCallback`) plutôt que de la recalculer chacun de leur
      côté.
    - Modèles (`ShiftTemplate`, décision #13) : même principe mais encodé
      directement sur l'objet (`paletteIndex`, choisi à la création par
      `nextAvailablePaletteIndex` — plus petite teinte libre parmi les
      autres modèles de la bibliothèque, recyclée quand un modèle est
      supprimé) plutôt qu'en `localStorage` séparé, puisque `ShiftTemplate`
      est déjà lui-même persisté en `localStorage` en entier (décision #13).
    - La bibliothèque de modèles (`PlanningPage`, sous le formulaire
      « Nouveau shift ») est triée par heure de début à l'affichage
      (`sortedTemplates`, ne change ni l'ordre stocké ni l'attribution des
      couleurs) et défile horizontalement au lieu de s'empiler sur
      plusieurs lignes passé un certain nombre de modèles
      (`templateRow` : `flexWrap: 'nowrap'`, `overflowX: 'auto'`,
      `ShiftTemplateCard` en `flexShrink: 0`).

27. **Sidebar (`AppShell`, web-manager) repliable en icônes seules, et fixe
    à l'écran — jamais emportée par le scroll d'une page.** Repliable :
    bouton dédié en bas de la sidebar (`toggleCollapsed`), état persisté en
    `localStorage` (`horaires_sidebar_collapsed`) pour ne pas revenir
    dépliée à chaque navigation/rechargement ; replié, la sidebar passe de
    220px à 72px, les libellés de nav disparaissent (icônes seules,
    `title` HTML en secours) et le nom de l'utilisateur/le texte
    "Déconnexion" se masquent. Pensé pour la page Planning (grille large,
    décision #12), mais s'applique à toutes les pages puisque `AppShell`
    est commun. Fixe : `root` (conteneur racine) est passé de
    `minHeight: 100vh` à `height: 100vh` et `main` a `minHeight: 0` en plus
    de son `overflowY: auto` existant — avant ce correctif, `root`
    grandissait avec le contenu de la page et c'est TOUTE LA PAGE (sidebar
    comprise) qui défilait avec le scroll du navigateur ; désormais seul
    `main` défile en interne, la sidebar reste plantée à l'écran quelle que
    soit la hauteur de la page affichée.

28. **checkin-mobile `PlanningScreen` (planning en lecture seule de
    l'employé) : vue mois en principal, plus vue semaine.** Remplace
    l'ancienne bande de 7 jours + liste des shifts de la semaine par un
    calendrier mensuel façon app d'agenda classique :
    - Grille de 42 cases (6 semaines, lundi en premier), jours hors mois
      estompés, navigation par mois (chevrons). Aujourd'hui repéré par un
      rond plein bleu ; un point sous le numéro signale un jour avec shift.
    - En dessous : TOUS les shifts du mois affiché (pas un seul jour à la
      fois), triés chronologiquement — la carte du jour courant ressort
      par sa couleur (fond `primaryTint` + bordure `primary`) plutôt qu'un
      simple libellé "Aujourd'hui" en texte.
    - La grille (nav + jours) est un `View` fixe, HORS de la
      `Animated.FlatList` qui affiche les cartes — seule la partie
      "jours de la grille" (pas la barre de nav du mois) se réduit en
      hauteur/opacité au scroll de la liste (`Animated.Value` piloté par
      `onScroll`, `extrapolate: 'clamp'`), pour rester repliée plutôt que
      de disparaître entièrement : le mois affiché et sa navigation restent
      toujours accessibles. Changer de mois réinitialise le scroll et
      redéplie la grille (sinon un nouveau mois s'ouvrirait à moitié
      réduit).
    - Liste sans rebond élastique (`bounces={false}`,
      `alwaysBounceVertical={false}`, `overScrollMode="never"`) — voulu à
      l'usage ; le pull-to-refresh (`RefreshControl`) fonctionne quand même,
      son geste ne dépend pas du rebond général de la liste.
    - Deux tentatives explorées et abandonnées sur cet écran (à ne pas
      reproduire sans nouvelle demande explicite) : (1) une pile/éventail
      en bas à droite regroupant les cartes sorties par le haut de l'écran
      au scroll (jugée pas voulue telle quelle) ; (2) des cartes en
      `position: sticky` pour qu'elles ne quittent jamais l'écran (mise de
      côté sans suite donnée). L'écran actuel n'a ni l'un ni l'autre.

## Stack

- Backend : NestJS + PostgreSQL + Prisma + Passport/JWT
- Mobile (checkin-mobile, checkin-pos) : React Native + Expo
- Web (web-manager) : React + Vite
- Monorepo : pnpm workspaces + Turborepo
- Types partagés : `packages/shared-types`
- Client API partagé : `packages/api-client` (utilisé par les 3 clients front,
  évite de dupliquer la logique d'appel)
- Design tokens partagés : `packages/ui-tokens`

## État actuel du repo

Le projet a dépassé le stade du squelette : les 3 apps front ont des écrans
réels et fonctionnels, le backend a sa logique métier implémentée (pas
seulement les routes), et il tourne en démo (seed réaliste, déploiement
Railway). Ce n'est plus une base à construire mais un produit existant à
faire évoluer — vérifier l'état réel du code avant de supposer qu'une brique
reste "à faire".

**Fait** :
- Schéma Prisma complet (`apps/backend/prisma/schema.prisma`) — 10 tables,
  incluant `ShiftOffer` (marché d'échange) et `AuditLog` (traçabilité —
  table présente mais **non encore alimentée par aucun service**, voir
  "Connu manquant" ci-dessous)
- `AuthModule` fonctionnel : register, login, refresh, stratégie JWT.
  Le logout (checkin-mobile) est **purement client** (vide le stockage local)
  — aucun endpoint de révocation de refresh token côté backend
- `TenantScopeGuard` et `JwtAuthGuard` (+ `DeviceAuthGuard`/`DeviceJwtStrategy`
  pour l'auth appareil de checkin-pos)
- Tous les modules backend ont leur logique métier écrite, avec test unitaire
  associé (8 fichiers `*.spec.ts`) : companies, sites, users, site-devices,
  time-entries, shifts, availabilities, geocoding
- Les 3 modes de pointage physiques sont opérationnels : QR rotatif TOTP
  (téléphone → tablette), badge/NFC, PIN — plus `gps` (activable/désactivable
  par entreprise et par employé, voir décision #9) et `manual_by_manager`
- Marché d'échange de shifts (`ShiftOffer`) avec validation manager et
  vérification anti-conflit (décision #7)
- Disponibilités (`Availability`) + vérification automatique avant
  assignation d'un shift (décision #8)
- Géocodage d'adresses (Nominatim) pour la création de sites et la résolution
  d'adresse en présence en direct (décision #10)
- Présence en direct (web-manager `PresenceLivePage` + checkin-mobile
  `PresenceLiveScreen`) avec badge de source de pointage et distance GPS
  colorée par seuil
- Écrans réels sur les 3 apps :
  - **checkin-mobile** : Login, Pointage (QR rotatif + fallback badge/PIN),
    Planning (lecture seule, scopé employé, vue mois en principal — voir
    décision #28), Disponibilités (bascule
    Disponible/Indisponible par jour, sans heures à saisir ; en option, une
    indisponibilité peut être restreinte à un seul bord — « à partir de » OU
    « jusqu'à », pas les deux — via « Préciser une plage horaire », voir
    décision #8 ; rebasculer un jour récurrent vers Disponible ouvre un
    choix garder-la-récurrence/annuler, décision #18), Marché de shifts,
    Validation d'échanges, Présence en direct, Profil (logout)
  - **checkin-pos** : Pairing d'appareil, Accueil kiosk (scan QR), Saisie PIN,
    Enrôlement badge, Écran hors-ligne
  - **web-manager** : Login, Planning (grille employés x jours, création/
    édition/assignation en drag-drop — voir décision #12), Approvals
    (validation d'échanges), Présence en direct, Équipe (override GPS par
    employé), Sites (CRUD + géocodage), Réglages (toggle GPS entreprise)
- Seed de démo réaliste : 6 semaines d'activité sur 8 employés
- `packages/shared-types` et `packages/api-client` à jour avec toutes les
  routes ci-dessus (évite la duplication de logique d'appel entre les 3 apps)
- Déploiement configuré sur Railway (migrations Prisma auto-appliquées au
  déploiement)

**Connu manquant / dette identifiée** :
1. Pas de révocation de session côté backend (voir logout ci-dessus) — à
   traiter avant toute exigence de sécurité plus stricte (déconnexion à
   distance, expiration forcée)
2. `AuditLog` existe dans le schéma mais n'est écrit par aucun service —
   pertinent pour l'exigence légale de traçabilité du pointage (2027), pas
   juste un nice-to-have
3. Pas d'écran de consultation/export des données de pointage par l'employé
   lui-même — à vérifier au regard de l'exigence "accessible" de la
   conformité belge

## Conventions de code

- Code (variables, fonctions, commentaires de code) en anglais
- Commentaires métier/documentation (comme ce fichier) peuvent rester en français
- DTOs validés avec `class-validator` sur chaque endpoint
- Toujours un test unitaire minimal sur les services touchant à l'auth ou au
  scoping multi-tenant (zone la plus sensible du projet)
