import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Project } from "@/hooks/useProjectActions";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api";

import { API_BASE } from '@/lib/config';

export default function Projects() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "size">("recent");

  // Redirect if not authenticated (only after auth check completes)
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, isAuthLoading, navigate]);

  // Fetch projects
  const { data: projectsData, isLoading: isProjectsLoading } = useQuery<Project[] | { results: Project[] }>({
    queryKey: ["projects", filter],
    queryFn: async () => {
      const url = new URL(`${API_BASE}/api/projects/`);
      if (filter === "published") {
        url.searchParams.set("is_public", "true");
      }
      const response = await fetch(url.toString(), {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch projects");
      const data = await response.json();
      // Handle both array and paginated response formats
      return Array.isArray(data) ? data : (data.results || []);
    },
    enabled: isAuthenticated,
  });

  // Ensure projects is always an array
  const projects: Project[] = Array.isArray(projectsData) ? projectsData : [];

  // Filter and sort projects
  const filteredProjects = projects
    .filter((project) => {
      if (filter === "draft") return !project.is_public;
      if (filter === "published") return project.is_public;
      return true;
    })
    .filter((project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "size":
          return (b.item_count || 0) - (a.item_count || 0);
        case "recent":
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      handler: () => handleNewProject(),
    },
    {
      key: "Delete",
      handler: () => {
        // Delete selected project (if any)
        // This would require selection state
      },
    },
  ]);

  const handleNewProject = async () => {
    try {
      const response = await apiRequest("/api/projects/", {
        method: "POST",
        body: JSON.stringify({
          name: "New Project",
          description: "",
          is_public: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || errorData.detail || `Failed to create project (${response.status})`;
        throw new Error(errorMessage);
      }
      
      const project = await response.json();
      toast.success("Project created successfully!");
      navigate(`/builder/${project.id}`);
    } catch (error: any) {
      console.error("Error creating project:", error);
      const errorMessage = error.message || "Failed to create project. Please try again.";
      toast.error(errorMessage);
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    handleNewProject(); // For now, just create a new project
    // In the future, this could load a template
  };

  // Show loading state while checking authentication
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        onNewProject={handleNewProject}
        onSearchChange={setSearchQuery}
        searchQuery={searchQuery}
      />

      <main className="container mx-auto max-w-7xl px-4 py-8">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="size">Size</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Projects Grid */}
        {isProjectsLoading ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground">Loading projects...</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <EmptyState onNewProject={handleNewProject} onSelectTemplate={handleSelectTemplate} />
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <AnimatePresence>
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </div>
  );
}

