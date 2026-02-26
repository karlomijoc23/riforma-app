import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Calendar,
  Euro,
  ArrowRight,
  Loader2,
  Building,
  Target,
} from "lucide-react";
import { api } from "../../shared/api";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { formatCurrency, formatDate } from "../../shared/formatters";
import ProjectDialog from "./components/ProjectDialog";

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const navigate = useNavigate();

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await api.getProjects();
      setProjects(res.data || []);
    } catch (error) {
      console.error("Failed to fetch projects", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700";
      case "planning":
        return "bg-blue-100 text-blue-700";
      case "completed":
        return "bg-slate-100 text-slate-700";
      case "on_hold":
        return "bg-yellow-100 text-yellow-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const calculateProgress = (project) => {
    // Simple progress based on spent vs budget for now, or use phases if available
    // For V1, let's use spent/budget ratio if budget exists
    if (!project.budget || project.budget === 0) return 0;
    const spent = project.spent || 0;
    const ratio = (spent / project.budget) * 100;
    return Math.min(Math.round(ratio), 100);
  };

  // FEATURE FLAG: Set to true to enable Projects module
  const ENABLE_PROJECTS_V2 = false;

  if (!ENABLE_PROJECTS_V2) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 px-4">
        <div className="relative">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 opacity-20 blur-xl"></div>
          <div className="relative rounded-full bg-blue-50 p-6">
            <Target className="h-12 w-12 text-blue-600" />
          </div>
        </div>
        <div className="space-y-2 max-w-lg">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Projekti v2 dolaze uskoro
          </h1>
          <p className="text-slate-500 text-lg">
            Trenutno radimo na potpunom redizajnu modula za upravljanje
            investicijama. Nova verzija donosi Gantt grafikone, praćenje
            financija i naprednu analitiku.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium text-blue-600 bg-blue-50 px-4 py-2 rounded-full">
          <Loader2 className="h-4 w-4 animate-spin" />U razvoju
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Projekti
          </h1>
          <p className="mt-1 text-muted-foreground">
            Upravljajte investicijskim projektima, pratite faze, troškove i
            dokumentaciju.
          </p>
        </div>
        <Button
          onClick={() => setIsDialogOpen(true)}
          size="lg"
          className="shadow-sm"
        >
          <Plus className="mr-2 h-4 w-4" /> Novi Projekt
        </Button>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed text-center">
          <Target className="mb-4 h-12 w-12 text-muted-foreground/20" />
          <h3 className="text-lg font-medium">Nema aktivnih projekata</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Započnite novi projekt kako biste pratili razvoj i investicije.
          </p>
          <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
            Kreiraj prvi projekt
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="group flex flex-col transition-all hover:shadow-md hover:border-primary/20"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                      {project.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {project.description || "Nema opisa"}
                    </CardDescription>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`capitalize ${getStatusColor(project.status)}`}
                  >
                    {project.status || "planning"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Budžet</span>
                    <span className="font-medium">
                      {formatCurrency(project.budget || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Potrošeno</span>
                    <span className="font-medium">
                      {formatCurrency(project.spent || 0)}
                    </span>
                  </div>
                  <div className="space-y-1 pt-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Iskorištenost budžeta</span>
                      <span>{calculateProgress(project)}%</span>
                    </div>
                    <Progress
                      value={calculateProgress(project)}
                      className="h-2"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {project.start_date
                        ? formatDate(project.start_date)
                        : "Nije definirano"}
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-4 border-t bg-muted/20">
                <Button
                  variant="ghost"
                  className="w-full justify-between hover:bg-white group-hover:text-primary"
                  onClick={() => navigate(`/projekti/${project.id}`)}
                >
                  Detalji projekta
                  <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <ProjectDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSuccess={fetchProjects}
      />
    </div>
  );
}
