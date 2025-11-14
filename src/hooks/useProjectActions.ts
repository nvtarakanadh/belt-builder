import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000";

export interface Project {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  owner_username?: string;
  is_public: boolean;
  item_count?: number;
  thumbnail_url?: string;
  metadata?: Record<string, any>;
}

export const useProjectActions = () => {
  const queryClient = useQueryClient();

  const duplicateProject = useMutation({
    mutationFn: async (projectId: number) => {
      // First, get the project data
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch project");
      const project = await response.json();

      // Create a new project with copied data
      const newProject = {
        name: `${project.name} (Copy)`,
        description: project.description,
        metadata: project.metadata,
        is_public: false,
      };

      const createResponse = await fetch(`${API_BASE}/api/projects/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newProject),
      });

      if (!createResponse.ok) throw new Error("Failed to duplicate project");
      return createResponse.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project duplicated successfully");
    },
    onError: () => {
      toast.error("Failed to duplicate project");
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (projectId: number) => {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete project");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete project");
    },
  });

  const renameProject = useMutation({
    mutationFn: async ({ projectId, name }: { projectId: number; name: string }) => {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error("Failed to rename project");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project renamed successfully");
    },
    onError: () => {
      toast.error("Failed to rename project");
    },
  });

  const updateThumbnail = useMutation({
    mutationFn: async ({ projectId, thumbnailUrl }: { projectId: number; thumbnailUrl: string }) => {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ metadata: { thumbnail_url: thumbnailUrl } }),
      });
      if (!response.ok) throw new Error("Failed to update thumbnail");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return {
    duplicateProject,
    deleteProject,
    renameProject,
    updateThumbnail,
  };
};

