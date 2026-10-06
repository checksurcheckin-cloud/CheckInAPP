import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Plus, Send } from 'lucide-react';
import { colors, spacing, radius, typography, shadows, shiftPalette } from '@horaires/ui-tokens';
import type { Availability, Shift, Site, User } from '@horaires/shared-types';
import { ApiError } from '@horaires/api-client';
import { apiClient, useAuth } from '../services/AuthService';
import { SiteSelect } from '../components/SiteSelect';
import { PlanningGridCell } from '../components/PlanningGridCell';
import { EmployeeRowHeader } from '../components/EmployeeRowHeader';
import { ShiftTemplateCard } from '../components/ShiftTemplateCard';
import { Dialog } from '../components/Dialog';
import { MonthCalendar } from '../components/MonthCalendar';
import { EditShiftDialog } from '../components/EditShiftDialog';
import {
  startOfWeek,
  addDays,
  startOfMonth,
  addMonths,
  durationMinutes,
  durationMinutesFromTimeRange,
  combineDateAndTime,
  formatDurationLabel,
  toHHmm,
  WEEKDAY_LABELS_FR,
} from '../lib/date';
import { assignInheritedShiftColor, resolveShiftColors } from '../lib/shiftColor';
import { getUnavailabilityInfo } from '../lib/availability';
import {
  loadShiftTemplates,
  saveShiftTemplates,
  nextAvailablePaletteIndex,
  type ShiftTemplate,
} from '../lib/shiftTemplates';

type ViewMode = 'week' | 'month';
type WeekScope = 'week' | 'day';

type DragPayload =
  | { type: 'shift'; shiftId: string; startsAt: string; endsAt: string }
  | { type: 'template'; templateId: string; startTime: string; endTime: string; roleNeeded?: string };
type DropPayload = { type: 'cell'; date: string; employeeId: string | null };

// SEUL endroit de tout le produit où on peut créer/éditer des horaires
// (voir CLAUDE.md — choix produit, pas une restriction API).
export function PlanningPage() {
  const { socket } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekScope, setWeekScope] = useState<WeekScope>('week');
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modèles de shift réutilisables ("16h-20h") — pas de date, voir
  // lib/shiftTemplates. Persistés en local, indépendamment du site affiché.
  const [templates, setTemplates] = useState<ShiftTemplate[]>(() => loadShiftTemplates());
  const [templateStartTime, setTemplateStartTime] = useState('09:00');
  const [templateEndTime, setTemplateEndTime] = useState('17:00');
  const [templateRole, setTemplateRole] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadAvailabilities = useCallback(() => {
    // Pas de userId : vue manager, toute l'entreprise (voir
    // AvailabilitiesService.findAll) — nécessaire pour marquer les jours
    // indisponibles de n'importe quel employé dans la grille.
    apiClient.getAvailabilities().then(setAvailabilities);
  }, []);

  useEffect(() => {
    apiClient.getSites().then((list) => {
      setSites(list);
      setSelectedSiteId((current) => current ?? list[0]?.id ?? null);
    });
    apiClient.getUsers().then(setUsers);
    loadAvailabilities();
  }, [loadAvailabilities]);

  const load = useCallback(async () => {
    if (!selectedSiteId) return;
    setIsLoading(true);
    try {
      // On charge toute la semaine même en scope "Jour" (juste un filtrage
      // d'affichage) — pas de refetch au moment de basculer le sélecteur.
      // La grille mois couvre les 6 semaines visibles, padding inclus.
      const rangeStart = viewMode === 'week' ? weekStart : startOfWeek(monthAnchor);
      const rangeEnd = viewMode === 'week' ? addDays(weekStart, 7) : addDays(rangeStart, 42);
      const list = await apiClient.getShifts({
        siteId: selectedSiteId,
        from: rangeStart.toISOString(),
        to: rangeEnd.toISOString(),
      });
      setShifts(list);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSiteId, weekStart, viewMode, monthAnchor]);

  useEffect(() => {
    void load();
  }, [load]);

  // Un autre manager (ou l'employé lui-même côté mobile) peut créer, publier
  // ou modifier un shift pendant que cette page est ouverte — on recharge via
  // les mêmes load() que le reste de la page plutôt que de fusionner un
  // payload partiel (voir realtime.gateway.ts côté backend).
  useEffect(() => {
    if (!socket) return;
    const onShiftsChanged = () => void load();
    const onAvailabilitiesChanged = () => loadAvailabilities();
    socket.on('shifts:changed', onShiftsChanged);
    socket.on('availabilities:changed', onAvailabilitiesChanged);
    return () => {
      socket.off('shifts:changed', onShiftsChanged);
      socket.off('availabilities:changed', onAvailabilitiesChanged);
    };
  }, [socket, load, loadAvailabilities]);

  const createTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateStartTime || !templateEndTime) return;
    if (templateStartTime === templateEndTime) {
      setError('Les heures de début et de fin ne peuvent pas être identiques');
      return;
    }
    setError(null);
    const next = [
      ...templates,
      {
        id: crypto.randomUUID(),
        startTime: templateStartTime,
        endTime: templateEndTime,
        roleNeeded: templateRole || undefined,
        paletteIndex: nextAvailablePaletteIndex(templates),
      },
    ];
    setTemplates(next);
    saveShiftTemplates(next);
    setTemplateRole('');
  };

  const deleteTemplate = (templateId: string) => {
    const next = templates.filter((t) => t.id !== templateId);
    setTemplates(next);
    saveShiftTemplates(next);
  };

  const deleteShift = (shiftId: string) => {
    setDeleteTarget(shiftId);
  };

  const confirmDeleteShift = async () => {
    if (!deleteTarget) return;
    const shiftId = deleteTarget;
    setDeleteTarget(null);
    setBusyId(shiftId);
    try {
      await apiClient.deleteShift(shiftId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const duplicateShift = async (shift: Shift) => {
    // Copie non assignée, même créneau/site/rôle — pratique pour ouvrir un
    // second poste sur le même horaire, ou comme point de départ avant de
    // glisser la copie vers un autre jour/employé.
    setBusyId(shift.id);
    try {
      await apiClient.createShift({
        siteId: shift.siteId,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        roleNeeded: shift.roleNeeded,
        status: shift.status,
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const updateShiftDetails = async (
    shiftId: string,
    payload: { siteId: string; startsAt: string; endsAt: string; roleNeeded?: string; status: Shift['status'] },
  ) => {
    await apiClient.updateShift(shiftId, payload);
    await load();
  };

  const assignEmployee = async (shiftId: string, userId: string) => {
    setBusyId(shiftId);
    try {
      await apiClient.assignShift(shiftId, userId);
      await load();
    } catch (err) {
      // Le backend refuse un employé déjà sur un shift qui chevauche celui-ci
      // dans le temps (409), ou une assignation en dehors de sa disponibilité
      // déclarée — même message affiché, qu'on arrive ici par glisser-déposer
      // ou via le menu déroulant de secours sur la carte.
      setConflictMessage(
        err instanceof ApiError ? err.message : "Impossible d'assigner cet employé à ce shift",
      );
    } finally {
      setBusyId(null);
    }
  };

  // Dépose d'un shift existant sur une cellule (employé x jour) : déplace le
  // jour si besoin, assigne l'employé si la cellule en porte un et que le
  // shift n'a pas déjà un titulaire différent (PlanningGridCell désactive ce
  // cas côté zone de dépôt, mais on retombe ici aussi par le menu déroulant).
  const moveShift = async (
    shiftId: string,
    oldStartsAt: string,
    oldEndsAt: string,
    targetDateISO: string,
    targetEmployeeId: string | null,
  ) => {
    const shift = shifts.find((s) => s.id === shiftId);
    const currentAssigneeId = shift?.assignments?.[0]?.userId ?? null;

    const oldStart = new Date(oldStartsAt);
    const oldEnd = new Date(oldEndsAt);
    const targetDate = new Date(targetDateISO);
    const oldDay = new Date(oldStart.getFullYear(), oldStart.getMonth(), oldStart.getDate());
    const newDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const dayDiff = Math.round((newDay.getTime() - oldDay.getTime()) / 86400000);

    if (dayDiff === 0 && (targetEmployeeId === null || targetEmployeeId === currentAssigneeId)) return;

    setBusyId(shiftId);
    try {
      if (dayDiff !== 0) {
        await apiClient.updateShift(shiftId, {
          startsAt: addDays(oldStart, dayDiff).toISOString(),
          endsAt: addDays(oldEnd, dayDiff).toISOString(),
        });
      }
      if (targetEmployeeId && targetEmployeeId !== currentAssigneeId) {
        await apiClient.assignShift(shiftId, targetEmployeeId);
      }
      await load();
    } catch (err) {
      setConflictMessage(err instanceof ApiError ? err.message : 'Impossible de déplacer ce shift');
    } finally {
      setBusyId(null);
    }
  };

  // Dépose d'un modèle (sans date) sur une cellule : crée le vrai shift daté
  // à ce jour-là, et l'assigne dans le même geste si déposé sur la ligne
  // d'un employé.
  const placeTemplate = async (
    template: { templateId: string; startTime: string; endTime: string; roleNeeded?: string },
    targetDateISO: string,
    targetEmployeeId: string | null,
  ) => {
    if (!selectedSiteId) return;
    const targetDate = new Date(targetDateISO);
    const startsAt = combineDateAndTime(targetDate, template.startTime);
    const minutes = durationMinutesFromTimeRange(template.startTime, template.endTime);
    const endsAt = new Date(startsAt.getTime() + minutes * 60000);

    setError(null);
    try {
      // Brouillon par défaut : le manager travaille et assigne le shift
      // avant de le publier explicitement (voir publishShift/publishAllDrafts)
      // — invisible pour l'employé tant qu'il ne l'est pas (ShiftsService.findAll).
      const created = await apiClient.createShift({
        siteId: selectedSiteId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        roleNeeded: template.roleNeeded,
        status: 'draft',
      });
      // Le shift déposé garde la couleur du modèle dont il vient, plutôt
      // que de s'en voir attribuer une autre au prochain calcul de
      // resolveShiftColors (voir lib/shiftColor.ts).
      const sourceTemplate = templates.find((t) => t.id === template.templateId);
      if (sourceTemplate) assignInheritedShiftColor(created.id, sourceTemplate.paletteIndex);
      if (targetEmployeeId) {
        try {
          await apiClient.assignShift(created.id, targetEmployeeId);
        } catch (err) {
          setConflictMessage(
            err instanceof ApiError ? err.message : "Impossible d'assigner cet employé à ce shift",
          );
        }
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la création du shift');
    }
  };

  const publishShift = async (shiftId: string) => {
    setBusyId(shiftId);
    try {
      await apiClient.updateShift(shiftId, { status: 'published' });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  // Publie en une fois tous les brouillons de la semaine chargée (pas
  // seulement ceux du jour affiché en scope "Jour") — le workflow visé est
  // "on construit toute la semaine en brouillon, puis on publie le tout".
  const publishAllDrafts = async () => {
    const draftIds = shifts.filter((s) => s.status === 'draft').map((s) => s.id);
    setPublishConfirmOpen(false);
    if (draftIds.length === 0) return;
    setIsPublishing(true);
    try {
      await Promise.all(draftIds.map((id) => apiClient.updateShift(id, { status: 'published' })));
      await load();
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDrag(event.active.data.current as DragPayload);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as DragPayload;
    const overData = over.data.current as DropPayload;
    if (overData.type !== 'cell') return;

    if (activeData.type === 'shift') {
      void moveShift(activeData.shiftId, activeData.startsAt, activeData.endsAt, overData.date, overData.employeeId);
    } else if (activeData.type === 'template') {
      void placeTemplate(activeData, overData.date, overData.employeeId);
    }
  };

  // Vue mois = aperçu ; cliquer un shift bascule sur la semaine correspondante,
  // qui reste le seul écran interactif (créer/assigner/déplacer/supprimer).
  const jumpToShiftWeek = (shift: Shift) => {
    setWeekStart(startOfWeek(new Date(shift.startsAt)));
    setViewMode('week');
    setWeekScope('week');
  };

  // Couleur mémorisée par shift (lib/shiftColor.ts) — un shift garde
  // toujours la même couleur, jamais un hash recalculé à chaque rendu.
  const shiftColors = useMemo(() => resolveShiftColors(shifts), [shifts]);
  const getShiftPalette = useCallback(
    (shiftId: string) => shiftColors.get(shiftId) ?? shiftPalette[0],
    [shiftColors],
  );

  // Un employé sans site assigné (siteId: null) reste visible sur TOUS les
  // sites plutôt que de disparaître partout tant qu'il n'a pas été rattaché
  // via la page Équipe — voir CLAUDE.md décision #25.
  const employees = users.filter(
    (u) => u.role === 'employee' && (u.siteId == null || u.siteId === selectedSiteId),
  );
  // Triés par heure de début pour la bibliothèque de modèles — "HH:mm" se
  // compare correctement en chaîne (zero-padded), pas besoin de parser.
  // N'affecte ni l'ordre stocké (saveShiftTemplates garde l'ordre de
  // création) ni l'attribution des couleurs (nextAvailablePaletteIndex ne
  // dépend pas de l'ordre), uniquement l'affichage.
  const sortedTemplates = [...templates].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const allDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const days = weekScope === 'day' ? [selectedDay] : allDays;

  // Seul un shift déjà assigné restreint la cellule cible (pas de
  // ré-assignation par glisser-déposer, le backend ne l'expose pas) — un
  // modèle ou un shift encore libre peut toujours être déposé.
  const blockedAssigneeId =
    activeDrag?.type === 'shift'
      ? shifts.find((s) => s.id === activeDrag.shiftId)?.assignments?.[0]?.userId ?? null
      : null;

  // Horaire (HH:mm, sans date) de l'élément en cours de glisser-déposer —
  // recombiné avec la date de chaque cellule (voir PlanningGridCell) pour
  // savoir si l'employé de la ligne est disponible pour CE créneau précis,
  // pas juste "ce jour-là" (une indisponibilité partielle ne bloque pas
  // toute la journée).
  const draggedTimeRange =
    activeDrag?.type === 'shift'
      ? { startTime: toHHmm(activeDrag.startsAt), endTime: toHHmm(activeDrag.endsAt) }
      : activeDrag?.type === 'template'
      ? { startTime: activeDrag.startTime, endTime: activeDrag.endTime }
      : null;

  const shiftsForDay = (date: Date) =>
    shifts
      .filter((s) => new Date(s.startsAt).toDateString() === date.toDateString())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const totalMinutesForEmployee = (userId: string) =>
    allDays.reduce((total, date) => {
      const dayTotal = shiftsForDay(date)
        .filter((s) => (s.assignments ?? []).some((a) => a.userId === userId))
        .reduce((sum, s) => sum + durationMinutes(s.startsAt, s.endsAt), 0);
      return total + dayTotal;
    }, 0);

  const draftCount = shifts.filter((s) => s.status === 'draft').length;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={styles.header}>
        <h1 style={styles.title}>Planning</h1>
        <div style={styles.headerRight}>
          <div style={styles.viewToggle}>
            <button
              className="btn"
              style={{ ...styles.viewToggleButton, ...(viewMode === 'week' ? styles.viewToggleButtonActive : {}) }}
              onClick={() => setViewMode('week')}
            >
              Semaine
            </button>
            <button
              className="btn"
              style={{ ...styles.viewToggleButton, ...(viewMode === 'month' ? styles.viewToggleButtonActive : {}) }}
              onClick={() => setViewMode('month')}
            >
              Mois
            </button>
          </div>
          <SiteSelect sites={sites} value={selectedSiteId} onChange={setSelectedSiteId} />
        </div>
      </div>

      {viewMode === 'week' ? (
        <div style={styles.weekNav}>
          <button className="btn btn-icon" style={styles.navButton} onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <span style={styles.weekLabel}>
            {weekStart.toLocaleDateString('fr-BE', { day: '2-digit', month: 'short' })} —{' '}
            {addDays(weekStart, 6).toLocaleDateString('fr-BE', { day: '2-digit', month: 'short' })}
          </span>
          <button className="btn btn-icon" style={styles.navButton} onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
          <button
            className="btn btn-gradient"
            style={styles.publishButton}
            disabled={draftCount === 0 || isPublishing}
            onClick={() => setPublishConfirmOpen(true)}
            title={draftCount === 0 ? 'Aucun brouillon à publier cette semaine' : undefined}
          >
            <Send size={14} strokeWidth={2.5} />
            {isPublishing ? 'Publication…' : draftCount > 0 ? `Publier ${draftCount} brouillon${draftCount > 1 ? 's' : ''}` : 'Publier'}
          </button>
        </div>
      ) : (
        <div style={styles.weekNav}>
          <button className="btn btn-icon" style={styles.navButton} onClick={() => setMonthAnchor(addMonths(monthAnchor, -1))}>
            <ChevronLeft size={16} strokeWidth={2.5} />
          </button>
          <span style={styles.weekLabel}>
            {monthAnchor.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' })}
          </span>
          <button className="btn btn-icon" style={styles.navButton} onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}>
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      )}

      <div style={styles.createForm}>
        <h2 style={styles.sectionTitle}>Nouveau shift</h2>
        <p style={styles.hint}>
          Définissez juste un horaire (ex: 16h-20h) — sans date. Il apparaît ci-dessous comme une carte
          réutilisable : glissez-la sur le planning pour créer le shift à une date précise, et l'assigner si
          vous la déposez sur la ligne d'un employé.
        </p>
        <form className="create-shift-row" style={styles.createRow} onSubmit={createTemplate}>
          <label style={styles.label}>
            Début
            <input
              style={styles.input}
              type="time"
              value={templateStartTime}
              onChange={(e) => setTemplateStartTime(e.target.value)}
              required
            />
          </label>
          <label style={styles.label}>
            Fin
            <input
              style={styles.input}
              type="time"
              value={templateEndTime}
              onChange={(e) => setTemplateEndTime(e.target.value)}
              required
            />
          </label>
          <label style={styles.label}>
            Rôle (optionnel)
            <input
              style={styles.input}
              placeholder="ex: Caissier"
              value={templateRole}
              onChange={(e) => setTemplateRole(e.target.value)}
            />
          </label>
          <button className="btn btn-gradient" style={styles.button} type="submit">
            <Plus size={16} strokeWidth={2.5} />
            Créer le modèle
          </button>
        </form>
        {error ? <p style={styles.error}>{error}</p> : null}

        {templates.length > 0 ? (
          <div style={styles.templateRow}>
            {sortedTemplates.map((template) => (
              <ShiftTemplateCard key={template.id} template={template} onDelete={deleteTemplate} />
            ))}
          </div>
        ) : (
          <p style={styles.emptyTemplates}>Aucun modèle pour l'instant — créez-en un ci-dessus.</p>
        )}
      </div>

      {viewMode === 'week' ? (
        isLoading ? (
          <p style={styles.muted}>Chargement…</p>
        ) : (
          <div className="planning-grid-wrapper" style={styles.gridWrapper}>
            <div
              className="planning-grid"
              style={{ ...styles.grid, gridTemplateColumns: `220px repeat(${days.length}, minmax(160px, 1fr))` }}
            >
              {/* Ligne d'en-tête : sélecteur Semaine/Jour + un en-tête par jour affiché */}
              <div style={styles.cornerCell}>
                <select
                  style={styles.scopeSelect}
                  value={weekScope}
                  onChange={(e) => {
                    const next = e.target.value as WeekScope;
                    if (next === 'day') setSelectedDay((d) => (allDays.some((day) => day.toDateString() === d.toDateString()) ? d : weekStart));
                    setWeekScope(next);
                  }}
                >
                  <option value="week">Semaine</option>
                  <option value="day">Jour</option>
                </select>
                {weekScope === 'day' ? (
                  <div style={styles.dayNav}>
                    <button className="btn btn-icon" style={styles.dayNavButton} onClick={() => setSelectedDay((d) => addDays(d, -1))}>
                      <ChevronLeft size={13} strokeWidth={2.5} />
                    </button>
                    <button className="btn btn-icon" style={styles.dayNavButton} onClick={() => setSelectedDay((d) => addDays(d, 1))}>
                      <ChevronRight size={13} strokeWidth={2.5} />
                    </button>
                  </div>
                ) : null}
              </div>
              {days.map((date) => {
                const isToday = new Date().toDateString() === date.toDateString();
                const weekdayIndex = weekScope === 'day' ? (date.getDay() + 6) % 7 : days.indexOf(date);
                return (
                  <div key={`head-${date.toISOString()}`} style={{ ...styles.dayHeaderCell, ...(isToday ? styles.dayHeaderCellToday : {}) }}>
                    <span style={styles.weekday}>{WEEKDAY_LABELS_FR[weekdayIndex]}</span>
                    <span style={styles.dayNumber}>{date.getDate()}</span>
                  </div>
                );
              })}

              {/* Ligne "Shifts disponibles" : pool non assigné, vert menthe très pâle */}
              <div style={styles.poolLabelCell}>Shifts disponibles</div>
              {days.map((date) => (
                <PlanningGridCell
                  key={`pool-${date.toISOString()}`}
                  date={date}
                  employeeId={null}
                  mint
                  shifts={shiftsForDay(date).filter((s) => (s.assignments ?? []).length === 0)}
                  dayShifts={shiftsForDay(date)}
                  employees={employees}
                  availabilities={availabilities}
                  getShiftPalette={getShiftPalette}
                  onDeleteShift={deleteShift}
                  onDuplicateShift={duplicateShift}
                  onAssign={assignEmployee}
                  onEditShift={setEditingShift}
                  onPublishShift={publishShift}
                  busyId={busyId}
                  blockedAssigneeId={blockedAssigneeId}
                  draggedTimeRange={draggedTimeRange}
                />
              ))}

              {/* Une ligne par employé */}
              {employees.map((user) => (
                <React.Fragment key={user.id}>
                  <EmployeeRowHeader user={user} totalMinutes={totalMinutesForEmployee(user.id)} />
                  {days.map((date) => (
                    <PlanningGridCell
                      key={`${user.id}-${date.toISOString()}`}
                      date={date}
                      employeeId={user.id}
                      shifts={shiftsForDay(date).filter((s) => (s.assignments ?? []).some((a) => a.userId === user.id))}
                      dayShifts={shiftsForDay(date)}
                      employees={employees}
                      availabilities={availabilities}
                      getShiftPalette={getShiftPalette}
                      onDeleteShift={deleteShift}
                      onDuplicateShift={duplicateShift}
                      onAssign={assignEmployee}
                      onEditShift={setEditingShift}
                      onPublishShift={publishShift}
                      busyId={busyId}
                      blockedAssigneeId={blockedAssigneeId}
                      draggedTimeRange={draggedTimeRange}
                      unavailabilityInfo={getUnavailabilityInfo(availabilities, user.id, date)}
                    />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        )
      ) : isLoading ? (
        <p style={styles.muted}>Chargement…</p>
      ) : (
        <MonthCalendar monthAnchor={monthAnchor} shifts={shifts} onSelectShift={jumpToShiftWeek} />
      )}

      <DragOverlay>
        {activeDrag?.type === 'shift' ? (
          <div style={{ ...styles.overlayChip, ...getShiftPalette(activeDrag.shiftId) }}>
            <strong>
              {new Date(activeDrag.startsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
              {' - '}
              {new Date(activeDrag.endsAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
            </strong>
            <span>{formatDurationLabel(durationMinutes(activeDrag.startsAt, activeDrag.endsAt))}</span>
          </div>
        ) : activeDrag?.type === 'template' ? (
          <div
            style={{
              ...styles.overlayChip,
              // Même couleur que la carte statique (paletteIndex stocké sur
              // le modèle), pas un hash de son id — sinon l'aperçu en train
              // d'être glissé changerait de teinte par rapport à sa carte.
              ...shiftPalette[
                (templates.find((t) => t.id === activeDrag.templateId)?.paletteIndex ?? 0) % shiftPalette.length
              ],
            }}
          >
            <strong>
              {activeDrag.startTime} - {activeDrag.endTime}
            </strong>
            <span>{formatDurationLabel(durationMinutesFromTimeRange(activeDrag.startTime, activeDrag.endTime))}</span>
          </div>
        ) : null}
      </DragOverlay>

      <Dialog
        open={conflictMessage !== null}
        variant="warning"
        title="Assignation impossible"
        message={conflictMessage ?? ''}
        cancelLabel="Compris"
        onClose={() => setConflictMessage(null)}
      />

      <Dialog
        open={deleteTarget !== null}
        variant="danger"
        title="Supprimer ce shift ?"
        message="Cette action est définitive et retire aussi toute assignation liée à ce shift."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        onConfirm={confirmDeleteShift}
        onClose={() => setDeleteTarget(null)}
      />

      <Dialog
        open={publishConfirmOpen}
        variant="info"
        title="Publier les brouillons ?"
        message={`${draftCount} shift${draftCount > 1 ? 's' : ''} en brouillon deviendront visibles pour les employés assignés.`}
        confirmLabel="Publier"
        cancelLabel="Annuler"
        onConfirm={publishAllDrafts}
        onClose={() => setPublishConfirmOpen(false)}
      />

      <EditShiftDialog
        shift={editingShift}
        sites={sites}
        onClose={() => setEditingShift(null)}
        onSave={updateShiftDetails}
      />
    </DndContext>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: typography.sizes['2xl'], fontWeight: 700, color: colors.textPrimary, margin: 0, fontFamily: "'Sora', sans-serif" },
  headerRight: { display: 'flex', alignItems: 'center', gap: spacing.md },
  viewToggle: {
    display: 'flex',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 2,
    border: `1px solid ${colors.border}`,
  },
  viewToggleButton: {
    padding: `${spacing.xs}px ${spacing.md}px`,
    borderRadius: radius.sm,
    border: 'none',
    backgroundColor: 'transparent',
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: 600,
    cursor: 'pointer',
  },
  viewToggleButtonActive: { backgroundColor: colors.surface, color: colors.primary, boxShadow: shadows.sm },
  weekNav: { display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  navButton: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    cursor: 'pointer',
  },
  weekLabel: { fontWeight: 600, color: colors.textPrimary },
  publishButton: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.md,
    border: 'none',
    color: colors.surface,
    fontWeight: 600,
    fontSize: typography.sizes.sm,
    cursor: 'pointer',
  },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: 700, color: colors.textPrimary, margin: 0, marginBottom: spacing.sm },
  createForm: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    border: `1px solid ${colors.border}`,
    marginBottom: spacing.xl,
  },
  hint: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 0, marginBottom: spacing.md },
  createRow: { display: 'flex', gap: spacing.md, flexWrap: 'wrap', alignItems: 'flex-end' },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: typography.sizes.xs, color: colors.textSecondary },
  input: {
    padding: spacing.sm,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    fontSize: typography.sizes.sm,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.lg}px`,
    borderRadius: radius.md,
    border: 'none',
    backgroundColor: colors.primary,
    color: colors.surface,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: colors.danger, fontSize: typography.sizes.sm, marginTop: spacing.sm },
  muted: { color: colors.textSecondary },
  // Défile horizontalement au lieu de s'empiler sur plusieurs lignes passé
  // un certain nombre de modèles — la bibliothèque reste sur une seule
  // ligne compacte quelle que soit sa taille (padding du bas pour laisser
  // de la place à la scrollbar sans qu'elle chevauche les cartes).
  templateRow: {
    display: 'flex',
    gap: spacing.sm,
    flexWrap: 'nowrap',
    overflowX: 'auto',
    marginTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  emptyTemplates: { fontSize: typography.sizes.xs, color: colors.textSecondary, fontStyle: 'italic', marginTop: spacing.md, marginBottom: 0 },
  gridWrapper: {
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    overflow: 'auto',
    backgroundColor: colors.surface,
  },
  grid: { display: 'grid' },
  cornerCell: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRight: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.background,
    position: 'sticky',
    left: 0,
    zIndex: 2,
  },
  scopeSelect: {
    fontSize: typography.sizes.xs,
    fontWeight: 600,
    color: colors.textPrimary,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.sm,
    padding: '4px 6px',
    backgroundColor: colors.surface,
  },
  dayNav: { display: 'flex', gap: 2 },
  dayNavButton: {
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    cursor: 'pointer',
    padding: 0,
  },
  dayHeaderCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    borderRight: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.background,
  },
  dayHeaderCellToday: { backgroundColor: colors.primaryTint },
  weekday: { fontSize: typography.sizes.xs, color: colors.textSecondary, textTransform: 'uppercase' },
  dayNumber: { fontSize: typography.sizes.md, fontWeight: 700, color: colors.textPrimary, fontFamily: "'Sora', sans-serif" },
  poolLabelCell: {
    display: 'flex',
    alignItems: 'center',
    padding: `${spacing.sm}px ${spacing.md}px`,
    fontSize: typography.sizes.xs,
    fontWeight: 700,
    color: colors.accent,
    borderRight: `1px solid ${colors.border}`,
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.accentTint,
  },
  overlayChip: {
    borderRadius: radius.md,
    padding: `${spacing.xs}px ${spacing.sm}px`,
    display: 'flex',
    flexDirection: 'column',
    fontSize: typography.sizes.xs,
    fontWeight: 700,
    boxShadow: shadows.lg,
  },

};
