import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";
import { ScrollArea } from "../../components/ui/scroll-area";
import { toast } from "../../components/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Plus, Calendar, Archive, Pencil } from "lucide-react";
import { api } from "../../shared/api";
import { useEntityStore } from "../../shared/entityStore";
import {
  formatDate,
  formatCurrency,
  formatDateTime,
} from "../../shared/formatters";

export const MAINTENANCE_STATUS_META = {
  novi: {
    title: "Novi",
    description: "Prijave koje čekaju trijažu",
    cardBorderClass: "border-l-4 border-sky-500",
    badgeClass: "border border-sky-200 bg-sky-100 text-sky-700",
  },
  ceka_dobavljaca: {
    title: "Čeka dobavljača",
    description: "Blokirano dok ne stigne dobavljač",
    cardBorderClass: "border-l-4 border-purple-500",
    badgeClass: "border border-purple-200 bg-purple-100 text-purple-700",
  },
  u_tijeku: {
    title: "U tijeku",
    description: "Radovi su u tijeku",
    cardBorderClass: "border-l-4 border-blue-500",
    badgeClass: "border border-blue-200 bg-blue-100 text-blue-700",
  },
  zavrseno: {
    title: "Završeno",
    description: "Radni nalog je izvršen",
    cardBorderClass: "border-l-4 border-emerald-500",
    badgeClass: "border border-emerald-200 bg-emerald-100 text-emerald-700",
  },
  arhivirano: {
    title: "Arhivirano",
    description: "Ostavljeno za evidenciju",
    cardBorderClass: "border-l-4 border-slate-400",
    badgeClass: "border border-slate-200 bg-slate-100 text-slate-600",
  },
};

export const MAINTENANCE_STATUS_ORDER = [
  "novi",
  "ceka_dobavljaca",
  "u_tijeku",
  "zavrseno",
];
export const ALL_MAINTENANCE_STATUSES = [
  ...MAINTENANCE_STATUS_ORDER,
  "arhivirano",
];

export const MAINTENANCE_PRIORITY_CONFIG = {
  nisko: {
    label: "Nizak prioritet",
    className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  srednje: {
    label: "Srednji prioritet",
    className: "border border-sky-200 bg-sky-50 text-sky-700",
  },
  visoko: {
    label: "Visok prioritet",
    className: "border border-orange-200 bg-orange-50 text-orange-700",
  },
  kriticno: {
    label: "Kritično",
    className: "border border-red-200 bg-red-50 text-red-700",
  },
};

export const MAINTENANCE_PRIORITY_ORDER = [
  "kriticno",
  "visoko",
  "srednje",
  "nisko",
];

export const EMPTY_MAINTENANCE_FORM = {
  naziv: "",
  opis: "",
  prioritet: "srednje",
  status: "novi",
  nekretnina_id: "",
  property_unit_id: "",
  prijavio: "",
  dodijeljeno: "",
  rok: "",
  oznake: "",
  procijenjeni_trosak: "",
  stvarni_trosak: "",
};

const MaintenanceBoard = ({
  enableFilters = false,
  enableDetails = true,
  title = "Radni nalozi održavanja",
  description = "Kanban pregled naloga kako bi odjel upravljanja nekretninama imao jasan uvid.",
}) => {
  const {
    maintenanceTasks,
    nekretnine,
    propertyUnitsById,
    propertyUnitsByProperty,
    refreshMaintenanceTasks,
    syncMaintenanceTask,
    loading: storeLoading,
    ensureNekretnine,
    ensureZakupnici,
    ensureMaintenanceTasks,
  } = useEntityStore();

  useEffect(() => {
    ensureNekretnine();
    ensureZakupnici();
    ensureMaintenanceTasks();
  }, [ensureNekretnine, ensureZakupnici, ensureMaintenanceTasks]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_MAINTENANCE_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    prioritet: "all",
    nekretnina: "all",
    status: "all",
    dueFrom: "",
    dueTo: "",
    oznaka: "",
  });
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentForm, setCommentForm] = useState({ author: "", message: "" });
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [isFiltersDialogOpen, setIsFiltersDialogOpen] = useState(false);
  const [archiveConfirmTask, setArchiveConfirmTask] = useState(null);

  const propertyMap = useMemo(() => {
    const map = {};
    for (const property of nekretnine) {
      if (property?.id) {
        map[property.id] = property;
      }
    }
    return map;
  }, [nekretnine]);

  const filteredTasks = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase();
    const labelTerms = filters.oznaka
      ? filters.oznaka
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      : [];
    let dueFromDate = filters.dueFrom ? new Date(filters.dueFrom) : null;
    let dueToDate = filters.dueTo ? new Date(filters.dueTo) : null;

    if (dueFromDate && Number.isNaN(dueFromDate.getTime())) {
      dueFromDate = null;
    }
    if (dueToDate && Number.isNaN(dueToDate.getTime())) {
      dueToDate = null;
    }
    if (dueToDate) {
      dueToDate.setHours(23, 59, 59, 999);
    }

    return (maintenanceTasks || []).filter((task) => {
      if (filters.prioritet !== "all" && task.prioritet !== filters.prioritet) {
        return false;
      }
      if (filters.status !== "all" && task.status !== filters.status) {
        return false;
      }
      if (
        filters.nekretnina !== "all" &&
        task.nekretnina_id !== filters.nekretnina
      ) {
        return false;
      }

      const dueDate = task.rok ? new Date(task.rok) : null;
      const dueValid = dueDate && !Number.isNaN(dueDate.getTime());
      if (dueFromDate && (!dueValid || dueDate < dueFromDate)) {
        return false;
      }
      if (dueToDate && (!dueValid || dueDate > dueToDate)) {
        return false;
      }

      if (labelTerms.length > 0) {
        const labels = (task.oznake || []).map((item) => item.toLowerCase());
        const matchesLabels = labelTerms.every((term) =>
          labels.some((label) => label.includes(term)),
        );
        if (!matchesLabels) {
          return false;
        }
      }

      if (searchTerm) {
        const property = propertyMap[task.nekretnina_id];
        const haystack = [
          task.naziv,
          task.opis,
          task.prijavio,
          task.dodijeljeno,
          property?.naziv,
          property?.adresa,
          ...(task.oznake || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });
  }, [maintenanceTasks, filters, propertyMap]);

  const groupedTasks = useMemo(() => {
    const buckets = {};
    for (const status of ALL_MAINTENANCE_STATUSES) {
      buckets[status] = [];
    }
    for (const task of filteredTasks || []) {
      const bucket = buckets[task.status] || (buckets[task.status] = []);
      bucket.push(task);
    }
    Object.values(buckets).forEach((items) => {
      items.sort((a, b) => {
        const firstDue = a.rok ? new Date(a.rok) : null;
        const secondDue = b.rok ? new Date(b.rok) : null;
        const firstDueValue =
          firstDue && !Number.isNaN(firstDue.getTime())
            ? firstDue.getTime()
            : Number.POSITIVE_INFINITY;
        const secondDueValue =
          secondDue && !Number.isNaN(secondDue.getTime())
            ? secondDue.getTime()
            : Number.POSITIVE_INFINITY;
        if (firstDueValue !== secondDueValue) {
          return firstDueValue - secondDueValue;
        }
        const firstUpdated = new Date(a.updated_at || a.created_at || 0).getTime();
        const secondUpdated = new Date(b.updated_at || b.created_at || 0).getTime();
        return secondUpdated - firstUpdated;
      });
    });
    return buckets;
  }, [filteredTasks]);

  const columns = useMemo(
    () =>
      MAINTENANCE_STATUS_ORDER.map((status) => ({
        status,
        meta: MAINTENANCE_STATUS_META[status],
        tasks: groupedTasks[status] || [],
      })),
    [groupedTasks],
  );

  const archivedTasks = groupedTasks.arhivirano || [];

  const unitsForSelectedProperty = useMemo(() => {
    if (!formData.nekretnina_id) {
      return [];
    }
    return propertyUnitsByProperty[formData.nekretnina_id] || [];
  }, [formData.nekretnina_id, propertyUnitsByProperty]);

  const resetForm = useCallback(() => {
    setFormData(EMPTY_MAINTENANCE_FORM);
  }, []);

  const handleDialogOpenChange = useCallback(
    (open) => {
      setIsDialogOpen(open);
      if (!open) {
        resetForm();
        setEditingTaskId(null);
      }
    },
    [resetForm],
  );

  const handleOpenDialog = useCallback(() => {
    setIsDialogOpen(true);
  }, [resetForm]);

  const handleEditClick = useCallback((task) => {
    setEditingTaskId(task.id);
    setFormData({
      naziv: task.naziv || "",
      opis: task.opis || "",
      prioritet: task.prioritet || "srednje",
      status: task.status || "novi",
      nekretnina_id: task.nekretnina_id || "none",
      property_unit_id: task.property_unit_id || "none",
      prijavio: task.prijavio || "",
      dodijeljeno: task.dodijeljeno || "",
      rok: task.rok || "",
      oznake: (task.oznake || []).join(", "),
      procijenjeni_trosak: task.procijenjeni_trosak || "",
      stvarni_trosak: task.stvarni_trosak || "",
    });
    setIsDialogOpen(true);
  }, []);

  const handleSubmitTask = async (event) => {
    event.preventDefault();
    if (!formData.naziv.trim()) {
      toast.error("Naziv radnog naloga je obavezan");
      return;
    }
    setIsSubmitting(true);
    try {
      const normaliseRelation = (value) => {
        if (!value || value === "none") {
          return undefined;
        }
        return value;
      };
      const parseCost = (value) => {
        if (value === null || value === undefined || value === "") {
          return undefined;
        }
        if (typeof value === "number") {
          return Number.isFinite(value) ? value : undefined;
        }
        const normalised = value.replace(/[^0-9,.-]/g, "").replace(",", ".");
        const parsed = Number(normalised);
        return Number.isFinite(parsed) ? parsed : undefined;
      };

      const payload = {
        naziv: formData.naziv.trim(),
        opis: formData.opis.trim() || undefined,
        prioritet: formData.prioritet,
        status: formData.status,
        nekretnina_id: normaliseRelation(formData.nekretnina_id),
        property_unit_id: normaliseRelation(formData.property_unit_id),
        prijavio: formData.prijavio.trim() || undefined,
        dodijeljeno: formData.dodijeljeno.trim() || undefined,
        rok: formData.rok || undefined,
        oznake: formData.oznake
          ? formData.oznake
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
        procijenjeni_trosak: parseCost(formData.procijenjeni_trosak),
        stvarni_trosak: parseCost(formData.stvarni_trosak),
      };

      let response;
      if (editingTaskId) {
        response = await api.updateMaintenanceTask(editingTaskId, payload);
        toast.success("Radni nalog je ažuriran");
      } else {
        response = await api.createMaintenanceTask(payload);
        toast.success("Radni nalog je dodan");
      }

      handleDialogOpenChange(false);
      syncMaintenanceTask?.(response.data);
      await refreshMaintenanceTasks();
    } catch (error) {
      console.error("Greška pri spremanju radnog naloga:", error);
      const message =
        error.response?.data?.detail || "Greška pri spremanju naloga";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchTaskDetails = useCallback(
    async (taskId) => {
      setDetailLoading(true);
      try {
        const response = await api.getMaintenanceTask(taskId);
        setSelectedTask(response.data);
        syncMaintenanceTask?.(response.data);
        return response.data;
      } catch (error) {
        console.error("Greška pri dohvaćanju detalja radnog naloga:", error);
        toast.error("Greška pri dohvaćanju detalja naloga");
        throw error;
      } finally {
        setDetailLoading(false);
      }
    },
    [syncMaintenanceTask],
  );

  const handleCardClick = useCallback(
    (task) => {
      if (!enableDetails) {
        return;
      }
      setSelectedTaskId(task.id);
      setSelectedTask(task);
      setDetailOpen(true);
      fetchTaskDetails(task.id);
    },
    [enableDetails, fetchTaskDetails],
  );

  const handleDetailOpenChange = useCallback((open) => {
    setDetailOpen(open);
    if (!open) {
      setSelectedTaskId(null);
      setSelectedTask(null);
      setCommentForm({ author: "", message: "" });
    }
  }, []);

  const handleFilterChange = useCallback((field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters({
      search: "",
      prioritet: "all",
      nekretnina: "all",
      status: "all",
      dueFrom: "",
      dueTo: "",
      oznaka: "",
    });
  }, []);

  const handleCommentSubmit = async (event) => {
    event.preventDefault();
    if (!selectedTaskId) {
      return;
    }
    if (!commentForm.message.trim()) {
      toast.error("Komentar ne može biti prazan");
      return;
    }
    setCommentSubmitting(true);
    try {
      const response = await api.addMaintenanceComment(selectedTaskId, {
        poruka: commentForm.message.trim(),
        autor: commentForm.author.trim() || undefined,
      });
      toast.success("Komentar je dodan");
      setCommentForm({ author: "", message: "" });
      const updatedTask = response.data;
      syncMaintenanceTask?.(updatedTask);
      setSelectedTask(updatedTask);
      await refreshMaintenanceTasks();
    } catch (error) {
      console.error("Greška pri dodavanju komentara:", error);
      const message =
        error.response?.data?.detail || "Greška pri dodavanju komentara";
      toast.error(message);
    } finally {
      setCommentSubmitting(false);
    }
  };

  const activityItems = useMemo(() => {
    if (!selectedTask || !selectedTask.aktivnosti) {
      return [];
    }
    return [...selectedTask.aktivnosti].sort((a, b) => {
      const first = new Date(
        a.timestamp || a.vrijeme || a.created_at || 0,
      ).getTime();
      const second = new Date(
        b.timestamp || b.vrijeme || b.created_at || 0,
      ).getTime();
      return second - first;
    });
  }, [selectedTask]);

  const resolutionHours = useMemo(() => {
    if (!selectedTask) {
      return null;
    }
    if (!selectedTask.created_at) {
      return null;
    }
    const start = new Date(selectedTask.created_at);
    if (Number.isNaN(start.getTime())) {
      return null;
    }
    const finishSource = selectedTask.zavrseno_na || selectedTask.updated_at;
    if (!finishSource) {
      return null;
    }
    const finish = new Date(finishSource);
    if (Number.isNaN(finish.getTime())) {
      return null;
    }
    const diff = (finish.getTime() - start.getTime()) / (1000 * 60 * 60);
    return Number.isFinite(diff) && diff >= 0 ? diff : null;
  }, [selectedTask]);

  const selectedTaskPriority = useMemo(() => {
    if (!selectedTask) {
      return null;
    }
    return (
      MAINTENANCE_PRIORITY_CONFIG[selectedTask.prioritet] ||
      MAINTENANCE_PRIORITY_CONFIG.srednje
    );
  }, [selectedTask]);

  const activityLabels = {
    kreiran: "Nalog kreiran",
    promjena_statusa: "Promjena statusa",
    komentar: "Komentar",
    uredjeno: "Ažuriranje naloga",
  };

  const handleStatusChange = useCallback(
    async (task, nextStatus) => {
      if (!task || !task.id || !nextStatus) {
        return;
      }

      const taskId = task.id;
      const previousStatus = task.status;
      const previousUpdatedAt = task.updated_at || null;
      const previousCompletedAt = task.zavrseno_na || null;
      const nowIso = new Date().toISOString();
      const isCompleted = ["zavrseno", "arhivirano"].includes(nextStatus);

      const optimisticTask = {
        ...task,
        status: nextStatus,
        updated_at: nowIso,
        zavrseno_na: isCompleted ? nowIso : null,
      };

      setStatusUpdating(taskId);
      syncMaintenanceTask?.(optimisticTask);

      if (enableDetails && selectedTaskId === taskId) {
        setSelectedTask((current) => {
          if (!current || current.id !== taskId) {
            return current;
          }
          return { ...current, ...optimisticTask };
        });
      }

      try {
        const response = await api.updateMaintenanceTask(taskId, {
          status: nextStatus,
        });
        const updatedTask = response.data;
        syncMaintenanceTask?.(updatedTask);
        toast.success("Status radnog naloga je ažuriran");

        if (enableDetails && selectedTaskId === taskId) {
          setSelectedTask(updatedTask);
        }
      } catch (error) {
        console.error("Greška pri promjeni statusa naloga:", error);
        const message =
          error.response?.data?.detail || "Ažuriranje statusa nije uspjelo";
        toast.error(message);

        const revertTask = {
          ...task,
          status: previousStatus,
          updated_at: previousUpdatedAt,
          zavrseno_na: previousCompletedAt,
        };
        syncMaintenanceTask?.(revertTask);

        if (enableDetails && selectedTaskId === taskId) {
          setSelectedTask((current) => {
            if (!current || current.id !== taskId) {
              return current;
            }
            return { ...current, ...revertTask };
          });
        }

        if (refreshMaintenanceTasks) {
          refreshMaintenanceTasks().catch((err) => {
            console.error("Greška pri vraćanju liste naloga:", err);
          });
        }
      } finally {
        setStatusUpdating(null);
      }
    },
    [
      enableDetails,
      refreshMaintenanceTasks,
      selectedTaskId,
      syncMaintenanceTask,
    ],
  );

  const today = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return base;
  }, []);

  const isLoading = storeLoading && maintenanceTasks.length === 0;

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      filters.search.trim() ||
        filters.oznaka.trim() ||
        filters.prioritet !== "all" ||
        filters.status !== "all" ||
        filters.nekretnina !== "all" ||
        filters.dueFrom ||
        filters.dueTo,
    );
  }, [filters]);

  const renderTaskCard = useCallback(
    (task, columnStatus = null) => {
      const statusMeta = MAINTENANCE_STATUS_META[task.status] || {};
      const priorityMeta =
        MAINTENANCE_PRIORITY_CONFIG[task.prioritet] ||
        MAINTENANCE_PRIORITY_CONFIG.srednje;
      const property = propertyMap[task.nekretnina_id];
      const unit = propertyUnitsById?.[task.property_unit_id];
      const dueDate = task.rok ? new Date(task.rok) : null;
      const validDueDate =
        dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null;
      const overdue =
        validDueDate &&
        validDueDate < today &&
        !["zavrseno", "arhivirano"].includes(task.status);
      const statusLabel = statusMeta.title || task.status;
      const hideStatusBadge = columnStatus === task.status;
      const dueLabel = task.rok ? formatDate(task.rok) : "Bez roka";
      const isCompleted =
        task.status === "zavrseno" || task.status === "arhivirano";

      const cardClasses = [
        "border border-border/60 shadow-sm",
        "w-full max-w-full min-w-0 overflow-hidden",
        statusMeta.cardBorderClass || "",
        enableDetails
          ? "cursor-pointer transition hover:border-primary/60"
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      return (
        <Card
          key={task.id}
          className={cardClasses}
          onClick={() => {
            if (enableDetails) {
              handleCardClick(task);
            }
          }}
          role={enableDetails ? "button" : undefined}
        >
          <CardHeader className="space-y-1 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">
                  {task.naziv}
                </CardTitle>
                <p className="text-xs text-muted-foreground/80">
                  {property ? property.naziv : "Nepovezana nekretnina"}
                  {unit ? ` • ${unit.naziv || unit.oznaka || unit.id}` : ""}
                </p>
              </div>
              {!hideStatusBadge && (
                <Badge
                  variant="outline"
                  className={
                    statusMeta.badgeClass ||
                    "border border-border bg-muted text-muted-foreground"
                  }
                >
                  {statusLabel}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {task.opis && (
              <p className="text-sm text-muted-foreground">{task.opis}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/90">
              <Badge variant="outline" className={priorityMeta.className}>
                {priorityMeta.label}
              </Badge>
              <div
                className={`flex items-center gap-1 ${overdue ? "font-semibold text-red-600" : ""}`}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>{dueLabel}</span>
              </div>
              {task.prijavio && (
                <span>
                  Prijavio:{" "}
                  <span className="font-medium text-foreground">
                    {task.prijavio}
                  </span>
                </span>
              )}
              {task.dodijeljeno && (
                <span>
                  Dodijeljeno:{" "}
                  <span className="font-medium text-foreground">
                    {task.dodijeljeno}
                  </span>
                </span>
              )}
            </div>

            {task.oznake && task.oznake.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {task.oznake.map((label) => (
                  <Badge
                    key={label}
                    variant="outline"
                    className="border-dashed border-border/50 text-muted-foreground"
                  >
                    #{label}
                  </Badge>
                ))}
              </div>
            )}

            {(task.procijenjeni_trosak != null ||
              task.stvarni_trosak != null) && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground/90">
                {task.procijenjeni_trosak != null && (
                  <span>
                    Procjena:{" "}
                    <span className="font-medium text-foreground">
                      {formatCurrency(task.procijenjeni_trosak)}
                    </span>
                  </span>
                )}
                {task.stvarni_trosak != null && (
                  <span>
                    Trošak:{" "}
                    <span className="font-medium text-foreground">
                      {formatCurrency(task.stvarni_trosak)}
                    </span>
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="min-w-[140px] flex-1">
                <Select
                  value={task.status}
                  onValueChange={(value) => handleStatusChange(task, value)}
                  disabled={statusUpdating === task.id}
                >
                  <SelectTrigger
                    className="h-8 w-full"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_MAINTENANCE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {MAINTENANCE_STATUS_META[status]?.title || status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {task.status !== "arhivirano" && (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleEditClick(task);
                      }}
                      title="Uredi nalog"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        setArchiveConfirmTask(task);
                      }}
                      disabled={statusUpdating === task.id}
                      title="Arhiviraj nalog"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    },
    [
      enableDetails,
      handleCardClick,
      handleStatusChange,
      propertyMap,
      propertyUnitsById,
      statusUpdating,
      today,
    ],
  );

  return (
    <section className="space-y-4" id="maintenance-board">
      <div className="flex flex-wrap items-start justify-between gap-3 md:items-center">
        {(title ||
          description ||
          (enableFilters && maintenanceTasks.length > 0)) && (
          <div className="space-y-1">
            {title && (
              <h2 className="text-2xl font-semibold text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
            {enableFilters && (
              <p className="text-xs text-muted-foreground">
                Prikazano {filteredTasks.length} od {maintenanceTasks.length}{" "}
                naloga
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="ml-2 text-primary underline-offset-2 hover:underline"
                  >
                    Poništi filtre
                  </button>
                )}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {enableFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsFiltersDialogOpen(true)}
            >
              Filteri
            </Button>
          )}
          <Button
            type="button"
            onClick={handleOpenDialog}
            className="md:w-auto"
            data-testid="add-maintenance-task"
          >
            <Plus className="mr-2 h-4 w-4" /> Dodaj radni nalog
          </Button>
        </div>
      </div>

      {enableFilters && (
        <Dialog
          open={isFiltersDialogOpen}
          onOpenChange={setIsFiltersDialogOpen}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Filtriraj radne naloge</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Suzi prikaz prema prioritetu, statusu, oznakama ili rokovima.
              </p>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="maintenance-search">Pretraži naloge</Label>
                  <Input
                    id="maintenance-search"
                    value={filters.search}
                    onChange={(event) =>
                      handleFilterChange("search", event.target.value)
                    }
                    placeholder="npr. klima, lift, hitno"
                  />
                </div>
                <div>
                  <Label htmlFor="maintenance-prioritet-filter">
                    Prioritet
                  </Label>
                  <Select
                    value={filters.prioritet}
                    onValueChange={(value) =>
                      handleFilterChange("prioritet", value)
                    }
                  >
                    <SelectTrigger id="maintenance-prioritet-filter">
                      <SelectValue placeholder="Svi prioriteti" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Svi prioriteti</SelectItem>
                      {Object.entries(MAINTENANCE_PRIORITY_CONFIG).map(
                        ([value, config]) => (
                          <SelectItem key={value} value={value}>
                            {config.label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="maintenance-status-filter">Status</Label>
                  <Select
                    value={filters.status}
                    onValueChange={(value) =>
                      handleFilterChange("status", value)
                    }
                  >
                    <SelectTrigger id="maintenance-status-filter">
                      <SelectValue placeholder="Svi statusi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Svi statusi</SelectItem>
                      {ALL_MAINTENANCE_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {MAINTENANCE_STATUS_META[status]?.title || status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="maintenance-property-filter">
                    Nekretnina
                  </Label>
                  <Select
                    value={filters.nekretnina}
                    onValueChange={(value) =>
                      handleFilterChange("nekretnina", value)
                    }
                  >
                    <SelectTrigger id="maintenance-property-filter">
                      <SelectValue placeholder="Sve nekretnine" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Sve nekretnine</SelectItem>
                      {nekretnine.map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.naziv}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="maintenance-label-filter">Oznake</Label>
                  <Input
                    id="maintenance-label-filter"
                    value={filters.oznaka}
                    onChange={(event) =>
                      handleFilterChange("oznaka", event.target.value)
                    }
                    placeholder="npr. elektrika, servis"
                  />
                </div>
                <div>
                  <Label htmlFor="maintenance-due-from">Rok od</Label>
                  <Input
                    id="maintenance-due-from"
                    type="date"
                    value={filters.dueFrom}
                    onChange={(event) =>
                      handleFilterChange("dueFrom", event.target.value)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="maintenance-due-to">Rok do</Label>
                  <Input
                    id="maintenance-due-to"
                    type="date"
                    value={filters.dueTo}
                    onChange={(event) =>
                      handleFilterChange("dueTo", event.target.value)
                    }
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-6">
              <div className="flex w-full justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    handleResetFilters();
                    setIsFiltersDialogOpen(false);
                  }}
                >
                  Poništi sve
                </Button>
                <Button
                  type="button"
                  onClick={() => setIsFiltersDialogOpen(false)}
                >
                  Zatvori
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isLoading && maintenanceTasks.length === 0 ? (
        <div className="flex items-center justify-center p-12">
          <p className="text-muted-foreground">Učitavam radne naloge...</p>
        </div>
      ) : maintenanceTasks.length === 0 && !hasActiveFilters ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-xl bg-muted/20 mx-1">
          <div className="bg-muted p-4 rounded-full mb-4">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Nema radnih naloga</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            Trenutno nema aktivnih radnih naloga. Kreirajte novi nalog za
            početak praćenja održavanja.
          </p>
          <Button onClick={handleOpenDialog}>
            <Plus className="mr-2 h-4 w-4" /> Kreiraj prvi nalog
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {columns.map(({ status, meta, tasks }) => (
              <div key={status} className="w-72 md:w-80 flex-shrink-0">
                <div className="flex h-[calc(100vh-280px)] min-h-[24rem] flex-col rounded-xl bg-muted/40 border border-border/40">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 w-2 rounded-full ${meta?.badgeClass?.replace("text-", "bg-").replace("bg-", "bg-opacity-0 ") || "bg-gray-400"}`}
                      />
                      <h3 className="text-sm font-semibold text-foreground">
                        {meta?.title || status}
                      </h3>
                    </div>
                    <Badge
                      variant="secondary"
                      className="bg-background/80 text-muted-foreground hover:bg-background"
                    >
                      {tasks.length}
                    </Badge>
                  </div>
                  <ScrollArea className="flex-1 px-3 pb-3">
                    <div className="space-y-3">
                      {tasks.length === 0 ? (
                        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border/50 bg-background/20">
                          <p className="text-xs text-muted-foreground/50">
                            Nema naloga
                          </p>
                        </div>
                      ) : (
                        tasks.map((task) => renderTaskCard(task, status))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {archivedTasks.length > 0 && (
        <details className="rounded-lg border border-border/60 bg-white/80 p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Arhivirani nalozi ({archivedTasks.length})
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {archivedTasks.map((task) => renderTaskCard(task, "arhivirano"))}
          </div>
        </details>
      )}

      <Dialog open={detailOpen} onOpenChange={handleDetailOpenChange}>
        <DialogContent className="max-w-4xl overflow-hidden p-0">
          <div className="flex flex-col">
            <DialogHeader className="border-b border-border/60 px-6 py-4">
              <DialogTitle>
                {selectedTask?.naziv || "Detalji radnog naloga"}
              </DialogTitle>
              {selectedTask && (
                <p className="text-sm text-muted-foreground">
                  {MAINTENANCE_STATUS_META[selectedTask.status]?.title ||
                    selectedTask.status}{" "}
                  •{" "}
                  {MAINTENANCE_PRIORITY_CONFIG[selectedTask.prioritet]?.label ||
                    "Prioritet"}
                </p>
              )}
            </DialogHeader>

            {detailLoading ? (
              <div className="px-6 py-10">
                <p className="text-sm text-muted-foreground">
                  Učitavam detalje naloga…
                </p>
              </div>
            ) : selectedTask ? (
              <div className="flex flex-col-reverse lg:flex-row-reverse">
                <aside className="border-t border-border/60 bg-muted/30 px-6 py-6 text-sm lg:w-80 lg:border-l lg:border-t-0">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-foreground">
                        Sažetak naloga
                      </h4>
                      <dl className="space-y-3">
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Nekretnina
                          </dt>
                          <dd className="font-medium text-foreground">
                            {propertyMap[selectedTask.nekretnina_id]?.naziv ||
                              "Nije povezano"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Jedinica
                          </dt>
                          <dd className="font-medium text-foreground">
                            {propertyUnitsById?.[selectedTask.property_unit_id]
                              ?.naziv ||
                              propertyUnitsById?.[selectedTask.property_unit_id]
                                ?.oznaka ||
                              "Nije odabrano"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Prijavio
                          </dt>
                          <dd className="font-medium text-foreground">
                            {selectedTask.prijavio || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Dodijeljeno
                          </dt>
                          <dd className="font-medium text-foreground">
                            {selectedTask.dodijeljeno || "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Rok
                          </dt>
                          <dd className="font-medium text-foreground">
                            {selectedTask.rok
                              ? formatDate(selectedTask.rok)
                              : "Bez roka"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Status
                          </dt>
                          <dd className="pt-1">
                            <Select
                              value={selectedTask.status}
                              onValueChange={(value) =>
                                handleStatusChange(selectedTask, value)
                              }
                              disabled={statusUpdating === selectedTask.id}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ALL_MAINTENANCE_STATUSES.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {MAINTENANCE_STATUS_META[status]?.title ||
                                      status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Prioritet
                          </dt>
                          <dd className="font-medium text-foreground">
                            {selectedTaskPriority ? (
                              <Badge
                                variant="outline"
                                className={selectedTaskPriority.className}
                              >
                                {selectedTaskPriority.label}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Procijenjeni trošak
                          </dt>
                          <dd className="font-medium text-foreground">
                            {selectedTask.procijenjeni_trosak != null
                              ? formatCurrency(selectedTask.procijenjeni_trosak)
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Stvarni trošak
                          </dt>
                          <dd className="font-medium text-foreground">
                            {selectedTask.stvarni_trosak != null
                              ? formatCurrency(selectedTask.stvarni_trosak)
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Završeno
                          </dt>
                          <dd className="font-medium text-foreground">
                            {selectedTask.zavrseno_na
                              ? formatDateTime(selectedTask.zavrseno_na)
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase text-muted-foreground">
                            Vrijeme rješavanja
                          </dt>
                          <dd className="font-medium text-foreground">
                            {resolutionHours != null
                              ? `${resolutionHours.toFixed(1)} h`
                              : "—"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    {selectedTask.oznake && selectedTask.oznake.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Oznake
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {selectedTask.oznake.map((label) => (
                            <Badge
                              key={label}
                              variant="outline"
                              className="border-dashed border-border/50 text-muted-foreground"
                            >
                              #{label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </aside>
                <ScrollArea className="max-h-[75vh] flex-1">
                  <div className="space-y-6 px-6 py-6">
                    {selectedTask.opis && (
                      <section className="rounded-lg border border-border/60 bg-background/60 p-4 space-y-2">
                        <h4 className="text-sm font-semibold text-foreground">
                          Opis naloga
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {selectedTask.opis}
                        </p>
                      </section>
                    )}

                    <section className="rounded-lg border border-border/60 bg-background/60 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">
                          Timeline aktivnosti
                        </h4>
                        {activityItems.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {activityItems.length} zapisa
                          </span>
                        )}
                      </div>
                      {activityItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Još nema zabilježenih aktivnosti za ovaj nalog.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {activityItems.map((activity, index) => {
                            const label =
                              activityLabels[activity.tip] || activity.tip;
                            const statusLabel = activity.status
                              ? MAINTENANCE_STATUS_META[activity.status]
                                  ?.title || activity.status
                              : null;
                            const timestamp = formatDateTime(
                              activity.timestamp ||
                                activity.vrijeme ||
                                activity.created_at,
                            );
                            const key =
                              activity.id ||
                              `${activity.tip}-${timestamp || index}`;
                            return (
                              <li key={key} className="relative flex gap-3">
                                <div
                                  className="mt-1 h-full w-px bg-border"
                                  aria-hidden
                                />
                                <div className="flex-1 rounded-lg border border-border/60 bg-white/80 p-3 shadow-sm">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge
                                        variant="outline"
                                        className="border-border text-muted-foreground"
                                      >
                                        {label}
                                      </Badge>
                                      {statusLabel && (
                                        <Badge
                                          variant="outline"
                                          className="border-primary/40 bg-primary/10 text-primary"
                                        >
                                          {statusLabel}
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {timestamp}
                                    </span>
                                  </div>
                                  {activity.autor && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Autor:{" "}
                                      <span className="font-medium text-foreground">
                                        {activity.autor}
                                      </span>
                                    </p>
                                  )}
                                  {activity.opis && (
                                    <p className="mt-2 text-sm text-foreground">
                                      {activity.opis}
                                    </p>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>

                    <section className="rounded-lg border border-border/60 bg-background/60 p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-foreground">
                        Dodaj komentar
                      </h4>
                      <form
                        onSubmit={handleCommentSubmit}
                        className="space-y-3"
                      >
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <Label htmlFor="comment-author">
                              Autor komentara
                            </Label>
                            <Input
                              id="comment-author"
                              value={commentForm.author}
                              onChange={(event) =>
                                setCommentForm((prev) => ({
                                  ...prev,
                                  author: event.target.value,
                                }))
                              }
                              placeholder="npr. Voditelj održavanja"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor="comment-message">Komentar *</Label>
                            <Textarea
                              id="comment-message"
                              rows={3}
                              value={commentForm.message}
                              onChange={(event) =>
                                setCommentForm((prev) => ({
                                  ...prev,
                                  message: event.target.value,
                                }))
                              }
                              placeholder="Zapišite ažuriranje, dogovoreni termin ili povratnu informaciju izvođača"
                              required
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCommentForm({ author: "", message: "" })
                            }
                            disabled={commentSubmitting}
                          >
                            Poništi
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={commentSubmitting}
                          >
                            {commentSubmitting ? "Spremam…" : "Dodaj komentar"}
                          </Button>
                        </div>
                      </form>
                    </section>
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="px-6 py-10">
                <p className="text-sm text-muted-foreground">
                  Detalji naloga nisu dostupni.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!archiveConfirmTask}
        onOpenChange={(open) => {
          if (!open) setArchiveConfirmTask(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arhiviraj radni nalog?</AlertDialogTitle>
            <AlertDialogDescription>
              Jeste li sigurni da želite arhivirati nalog &quot;
              {archiveConfirmTask?.naziv}&quot;? Arhivirani nalozi se neće
              prikazivati u glavnom pregledu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Odustani</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiveConfirmTask) {
                  handleStatusChange(archiveConfirmTask, "arhivirano");
                }
                setArchiveConfirmTask(null);
              }}
            >
              Arhiviraj
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTaskId ? "Uredi radni nalog" : "Dodaj radni nalog"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Zabilježite sve potrebne aktivnosti kako bi tim mogao reagirati na
              vrijeme.
            </p>
          </DialogHeader>
          <form onSubmit={handleSubmitTask} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="task-naziv">Naziv naloga *</Label>
                <Input
                  id="task-naziv"
                  value={formData.naziv}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      naziv: event.target.value,
                    }))
                  }
                  placeholder="npr. Servis klima uređaja"
                  required
                />
              </div>
              <div>
                <Label htmlFor="task-prioritet">Prioritet</Label>
                <Select
                  value={formData.prioritet}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, prioritet: value }))
                  }
                >
                  <SelectTrigger id="task-prioritet">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MAINTENANCE_PRIORITY_CONFIG).map(
                      ([value, config]) => (
                        <SelectItem key={value} value={value}>
                          {config.label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger id="task-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_MAINTENANCE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {MAINTENANCE_STATUS_META[status]?.title || status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-rok">Rok izvedbe</Label>
                <Input
                  id="task-rok"
                  type="date"
                  value={formData.rok}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      rok: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="task-nekretnina">Nekretnina</Label>
                <Select
                  value={formData.nekretnina_id || "none"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      nekretnina_id: value === "none" ? "" : value,
                      property_unit_id: "",
                    }))
                  }
                >
                  <SelectTrigger id="task-nekretnina">
                    <SelectValue placeholder="Odaberite nekretninu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Bez povezivanja</SelectItem>
                    {nekretnine.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.naziv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-unit">Jedinica</Label>
                <Select
                  value={formData.property_unit_id || "none"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      property_unit_id: value === "none" ? "" : value,
                    }))
                  }
                  disabled={
                    !formData.nekretnina_id ||
                    unitsForSelectedProperty.length === 0
                  }
                >
                  <SelectTrigger id="task-unit">
                    <SelectValue
                      placeholder={
                        formData.nekretnina_id
                          ? "Odaberite jedinicu"
                          : "Prvo odaberite nekretninu"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Bez jedinice</SelectItem>
                    {unitsForSelectedProperty.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.oznaka || unit.naziv || unit.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="task-prijavio">Prijavio</Label>
                <Input
                  id="task-prijavio"
                  value={formData.prijavio}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      prijavio: event.target.value,
                    }))
                  }
                  placeholder="npr. Ana Perić"
                />
              </div>
              <div>
                <Label htmlFor="task-dodijeljeno">Voditelj naloga</Label>
                <Input
                  id="task-dodijeljeno"
                  value={formData.dodijeljeno}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      dodijeljeno: event.target.value,
                    }))
                  }
                  placeholder="npr. Voditelj održavanja"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="task-procjena">Procijenjeni trošak (€)</Label>
                <Input
                  id="task-procjena"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.procijenjeni_trosak}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      procijenjeni_trosak: event.target.value,
                    }))
                  }
                  placeholder="npr. 250"
                />
              </div>
              <div>
                <Label htmlFor="task-trosak">Stvarni trošak (€)</Label>
                <Input
                  id="task-trosak"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.stvarni_trosak}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      stvarni_trosak: event.target.value,
                    }))
                  }
                  placeholder="npr. 220"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="task-opis">Opis naloga</Label>
              <Textarea
                id="task-opis"
                value={formData.opis}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, opis: event.target.value }))
                }
                rows={4}
                placeholder="Detaljan opis problema, potrebni materijali ili upute za izvođača"
              />
            </div>

            <div>
              <Label htmlFor="task-oznake">Oznake</Label>
              <Input
                id="task-oznake"
                value={formData.oznake}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    oznake: event.target.value,
                  }))
                }
                placeholder="npr. elektrika, hitno"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Razdvojite oznake zarezom kako biste brže filtrirali zadatke.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
                disabled={isSubmitting}
              >
                Odustani
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Spremam…"
                  : editingTaskId
                    ? "Spremi promjene"
                    : "Kreiraj nalog"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default MaintenanceBoard;
