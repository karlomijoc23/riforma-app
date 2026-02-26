import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Calendar,
  DollarSign,
  PieChart,
  Printer,
  Users,
  Briefcase,
  TrendingUp,
  Building,
  Home,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { api } from "../../shared/api";
import { formatCurrency, formatDate } from "../../shared/formatters";
import { AddPhaseDialog } from "./components/AddPhaseDialog";
import { AddDocumentDialog } from "./components/AddDocumentDialog";
import { AddTransactionDialog } from "./components/AddTransactionDialog";
import { AddStakeholderDialog } from "./components/AddStakeholderDialog";
import { LinkPropertyDialog } from "./components/LinkPropertyDialog";
import { EditProjectDialog } from "./components/EditProjectDialog";
import ProjectGanttEngine from "./components/ProjectGanttEngine";
import LegalChecklist from "./components/LegalChecklist";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";

export default function ProjectDetailsPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [linkedProperty, setLinkedProperty] = useState(null);
  const [linkedUnits, setLinkedUnits] = useState([]);
  const [txPage, setTxPage] = useState(1);
  const TX_PAGE_SIZE = 15;

  useEffect(() => {
    loadProject();
  }, [id]);

  useEffect(() => {
    if (project?.linked_property_id) {
      loadLinkedData(project.linked_property_id);
    } else {
      setLinkedProperty(null);
      setLinkedUnits([]);
    }
  }, [project?.linked_property_id]);

  const loadLinkedData = async (propId) => {
    try {
      const [propRes, unitsRes] = await Promise.all([
        api.getNekretnina(propId),
        api.getUnitsForProperty(propId),
      ]);
      setLinkedProperty(propRes.data);
      setLinkedUnits(unitsRes.data);
    } catch (err) {
      console.error("Failed to load linked property", err);
    }
  };

  const loadProject = async () => {
    try {
      setError(null);
      const res = await api.getProject(id);
      setProject(res.data);
    } catch (err) {
      console.error("Failed to load project details", err);
      const status = err?.response?.status;
      if (status === 404) {
        setError("not_found");
      } else {
        setError("load_failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const projectedROI = React.useMemo(() => {
    if (!project?.projected_revenue || !project?.budget || project.budget === 0)
      return null;
    const profit = project.projected_revenue - project.budget;
    return (profit / project.budget) * 100;
  }, [project]);

  const handleProjectUpdate = (updatedProject) => {
    if (updatedProject) {
      setProject(updatedProject);
    } else {
      // Fallback if no data passed
      loadProject();
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container py-8 text-center">
        <h2 className="text-xl font-semibold">
          {error === "load_failed"
            ? "Greška pri učitavanju projekta"
            : "Projekt nije pronađen"}
        </h2>
        {error === "load_failed" && (
          <Button className="mt-4 mr-2" variant="outline" onClick={loadProject}>
            Pokušaj ponovo
          </Button>
        )}
        <Button asChild className="mt-4" variant="outline">
          <Link to="/projekti">Natrag na listu</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/projekti">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {project.name}
            </h1>
            <p className="text-muted-foreground">{project.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <LinkPropertyDialog
            project={project}
            onProjectUpdated={handleProjectUpdate}
          />
          <EditProjectDialog
            project={project}
            onProjectUpdated={handleProjectUpdate}
          />
          <Button variant="outline" asChild>
            <Link to={`/projekti/${project.id}/report`} target="_blank">
              <Printer className="mr-2 h-4 w-4" />
              Ispis Izvješća
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budžet</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(project.budget || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Potrošeno: {formatCurrency(project.spent || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rok završetka</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {project.end_date ? formatDate(project.end_date) : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              Početak:{" "}
              {project.start_date ? formatDate(project.start_date) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Faza</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {project.phases?.filter((p) => p.status === "completed").length} /{" "}
              {project.phases?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">Faza završeno</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Projicirani ROI
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${projectedROI && projectedROI > 0 ? "text-green-600" : ""}`}
            >
              {projectedROI ? `${projectedROI.toFixed(2)}%` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              Prihod: {formatCurrency(project.projected_revenue || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Pregled</TabsTrigger>
          <TabsTrigger value="gantt">Vremenski plan (Gantt)</TabsTrigger>
          <TabsTrigger value="finance">Financije</TabsTrigger>
          <TabsTrigger value="team">Tim</TabsTrigger>
          <TabsTrigger value="inventory">Inventar</TabsTrigger>
          <TabsTrigger value="legal">Dozvole</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sažetak projekta</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                {project.description || "Nema opisa."}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gantt" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Vremenski plan projekta</CardTitle>
              <AddPhaseDialog
                projectId={project.id}
                onPhaseAdded={handleProjectUpdate}
              />
            </CardHeader>
            <CardContent>
              {(!project.phases || project.phases.length === 0) && (
                <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  <div className="font-semibold mb-1">
                    👋 Dobrodošli u Gantt pregled!
                  </div>
                  <p>
                    Trenutno nemate definiranih faza. Prikazujemo{" "}
                    <strong>primjer podataka</strong> kako bi grafikon izgledao.
                    <br />
                    Kliknite na gumb <strong>"Dodaj Fazu"</strong> iznad da
                    biste započeli s unosom stvarnih podataka.
                  </p>
                </div>
              )}
              <ProjectGanttEngine
                phases={
                  !project.phases || project.phases.length === 0
                    ? [
                        {
                          id: "d1",
                          name: "Primjer: Priprema dokumentacije",
                          start_date: "2025-01-10",
                          end_date: "2025-01-25",
                          status: "completed",
                        },
                        {
                          id: "d2",
                          name: "Primjer: Ishođenje dozvola",
                          start_date: "2025-01-26",
                          end_date: "2025-03-15",
                          status: "in_progress",
                        },
                        {
                          id: "d3",
                          name: "Primjer: Građevinski radovi",
                          start_date: "2025-03-16",
                          end_date: "2025-06-01",
                          status: "pending",
                        },
                      ]
                    : project.phases
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finance" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Transakcije i Budžet</CardTitle>
              <AddTransactionDialog
                projectId={project.id}
                onTransactionAdded={handleProjectUpdate}
              />
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Budget Breakdown Visualization */}
              {project.budget_breakdown &&
                Object.keys(project.budget_breakdown).length > 0 && (
                  <div className="space-y-4 border-b pb-6">
                    <h3 className="font-semibold">Raspodjela Budžeta</h3>
                    {Object.entries(project.budget_breakdown).map(
                      ([category, amount]) => {
                        // Calculate actual spent for this category
                        const spent =
                          project.transactions
                            ?.filter(
                              (t) =>
                                t.category?.toLowerCase() ===
                                  category.toLowerCase() &&
                                t.type === "expense",
                            )
                            .reduce((sum, t) => sum + t.amount, 0) || 0;
                        const percentage = Math.min(
                          (spent / amount) * 100,
                          100,
                        );

                        return (
                          <div key={category} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="capitalize">{category}</span>
                              <span>
                                {formatCurrency(spent)} /{" "}
                                {formatCurrency(amount)}
                              </span>
                            </div>
                            <Progress
                              value={percentage}
                              className={`h-2 ${percentage > 100 ? "bg-red-500" : ""}`}
                            />
                          </div>
                        );
                      },
                    )}
                  </div>
                )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead>Kategorija</TableHead>
                    <TableHead>Opis</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Iznos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!project.transactions ||
                  project.transactions.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground"
                      >
                        Nema zabilježenih transakcija.
                      </TableCell>
                    </TableRow>
                  ) : (
                    project.transactions
                      .slice((txPage - 1) * TX_PAGE_SIZE, txPage * TX_PAGE_SIZE)
                      .map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>{formatDate(tx.date)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                tx.type === "income" ? "success" : "secondary"
                              }
                            >
                              {tx.type === "income" ? "Prihod" : "Trošak"}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize">
                            {tx.category}
                          </TableCell>
                          <TableCell>{tx.description || "-"}</TableCell>
                          <TableCell>{tx.paid_to || "-"}</TableCell>
                          <TableCell
                            className={`text-right font-medium ${tx.type === "income" ? "text-green-600" : "text-red-600"}`}
                          >
                            {tx.type === "income" ? "+" : "-"}
                            {formatCurrency(tx.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
              {project.transactions &&
                project.transactions.length > TX_PAGE_SIZE && (
                  <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={txPage === 1}
                      onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                    >
                      Prethodna
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {txPage} /{" "}
                      {Math.ceil(project.transactions.length / TX_PAGE_SIZE)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        txPage >=
                        Math.ceil(project.transactions.length / TX_PAGE_SIZE)
                      }
                      onClick={() => setTxPage((p) => p + 1)}
                    >
                      Sljedeća
                    </Button>
                  </div>
                )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Projektni Tim</CardTitle>
              <AddStakeholderDialog
                projectId={project.id}
                onStakeholderAdded={handleProjectUpdate}
              />
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {project.stakeholders?.map((member) => (
                  <Card key={member.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        {member.role}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold">{member.name}</div>
                      {member.contact_info && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {member.contact_info}
                        </div>
                      )}
                      {member.notes && (
                        <div className="text-xs text-muted-foreground mt-2 italic">
                          {member.notes}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {!project.stakeholders?.length && (
                  <div className="col-span-full text-center text-muted-foreground py-8">
                    Nema dodanih članova tima.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Povezana Nekretnina</CardTitle>
            </CardHeader>
            <CardContent>
              {!linkedProperty ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building className="mx-auto h-12 w-12 opacity-50 mb-4" />
                  <p>Ovaj projekt nije povezan s nekretninom u inventaru.</p>
                  <div className="mt-4">
                    <LinkPropertyDialog
                      project={project}
                      onProjectUpdated={handleProjectUpdate}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-start gap-4 p-4 border rounded-lg bg-muted/50">
                    <Home className="h-8 w-8 text-primary mt-1" />
                    <div>
                      <h3 className="text-lg font-bold">
                        {linkedProperty.naziv}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {linkedProperty.adresa}{linkedProperty.grad ? `, ${linkedProperty.grad}` : ""}
                      </p>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span>
                          Površina:{" "}
                          <strong>{linkedProperty.povrsina} m²</strong>
                        </span>
                        <span>
                          Tip: <strong>{linkedProperty.vrsta}</strong>
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      asChild
                    >
                      <Link
                        to={`/nekretnine/${linkedProperty.id}`}
                        target="_blank"
                      >
                        Pregledaj
                      </Link>
                    </Button>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-4">
                      Pregled Jedinica (Stanovi/Poslovni prostori)
                    </h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Oznaka</TableHead>
                          <TableHead>Tip</TableHead>
                          <TableHead>Površina</TableHead>
                          <TableHead>Kat</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linkedUnits.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-center text-muted-foreground"
                            >
                              Nema unesenih jedinica.
                            </TableCell>
                          </TableRow>
                        ) : (
                          linkedUnits.map((unit) => (
                            <TableRow key={unit.id}>
                              <TableCell className="font-medium">
                                {unit.oznaka}
                              </TableCell>
                              <TableCell>{unit.naziv}</TableCell>
                              <TableCell>{unit.povrsina_m2} m²</TableCell>
                              <TableCell>{unit.kat}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{unit.status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="legal" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Status dozvola i suglasnosti</CardTitle>
              <AddDocumentDialog
                projectId={project.id}
                onDocumentAdded={handleProjectUpdate}
              />
            </CardHeader>
            <CardContent>
              <LegalChecklist documents={project.documents} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
