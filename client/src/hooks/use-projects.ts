import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateProjectRequest } from "@shared/routes";
import { type Project } from "@shared/schema";

// GET /api/projects
export function useProjects() {
  return useQuery({
    queryKey: [api.projects.list.path],
    queryFn: async () => {
      const res = await fetch(api.projects.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch projects");
      return api.projects.list.responses[200].parse(await res.json());
    },
  });
}

// GET /api/projects/active (excludes archived and deleted)
export function useActiveProjects() {
  return useQuery<Project[]>({
    queryKey: ["/api/projects/active"],
    queryFn: async () => {
      const res = await fetch("/api/projects/active", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch active projects");
      return res.json();
    },
  });
}

// GET /api/projects/archived (excludes deleted), optionally filtered by year
export function useArchivedProjects(year?: number) {
  return useQuery<Project[]>({
    queryKey: ["/api/projects/archived", year],
    queryFn: async () => {
      const url = year ? `/api/projects/archived?year=${year}` : "/api/projects/archived";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch archived projects");
      return res.json();
    },
  });
}

// GET /api/projects/archived/years
export function useArchivedYears() {
  return useQuery<number[]>({
    queryKey: ["/api/projects/archived/years"],
    queryFn: async () => {
      const res = await fetch("/api/projects/archived/years", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch archived years");
      return res.json();
    },
  });
}

// GET /api/projects/:id
export function useProject(id: number) {
  return useQuery({
    queryKey: [api.projects.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.projects.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch project");
      return api.projects.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

// POST /api/projects
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateProjectRequest) => {
      const validated = api.projects.create.input.parse(data);
      const res = await fetch(api.projects.create.path, {
        method: api.projects.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.projects.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create project");
      }
      return api.projects.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.projects.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/active"] });
    },
  });
}

// PATCH /api/projects/:id
export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CreateProjectRequest> }) => {
      const validated = api.projects.update.input.parse(data);
      const res = await fetch(buildUrl(api.projects.update.path, { id }), {
        method: api.projects.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update project");
      }
      return api.projects.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.projects.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.projects.get.path, variables.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/active"] });
    },
  });
}

// POST /api/projects/:id/archive
export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${id}/archive`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to archive project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.projects.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/archived/years"] });
    },
  });
}

// POST /api/projects/:id/restore
export function useRestoreProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${id}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to restore project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.projects.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/archived/years"] });
    },
  });
}

// DELETE /api/projects/:id (soft delete)
export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.projects.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/archived/years"] });
    },
  });
}

// POST /api/projects/:id/restore-deleted (undo soft delete)
export function useRestoreDeletedProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/projects/${id}/restore-deleted`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to restore deleted project");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.projects.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/archived/years"] });
    },
  });
}
