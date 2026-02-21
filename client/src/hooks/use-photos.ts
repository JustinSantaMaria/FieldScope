import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { CreatePhotoRequest, Photo } from "@shared/schema";

// GET /api/areas/:areaId/photos
export function usePhotos(areaId: number) {
  return useQuery({
    queryKey: [api.photos.list.path, areaId],
    queryFn: async () => {
      const url = buildUrl(api.photos.list.path, { areaId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch photos");
      return api.photos.list.responses[200].parse(await res.json());
    },
    enabled: !!areaId,
  });
}

// GET /api/photos/:id
export function usePhoto(photoId: number) {
  return useQuery({
    queryKey: [api.photos.get.path, photoId],
    queryFn: async () => {
      const url = buildUrl(api.photos.get.path, { id: photoId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch photo");
      return api.photos.get.responses[200].parse(await res.json());
    },
    enabled: !!photoId,
  });
}

// POST /api/areas/:areaId/photos
export function useCreatePhoto(areaId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Omit<CreatePhotoRequest, "areaId">) => {
      const validated = api.photos.create.input.parse(data);
      const url = buildUrl(api.photos.create.path, { areaId });
      const res = await fetch(url, {
        method: api.photos.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.photos.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to upload photo");
      }
      return api.photos.create.responses[201].parse(await res.json());
    },
    onSuccess: () => 
      queryClient.invalidateQueries({ queryKey: [api.photos.list.path, areaId] }),
  });
}

// PATCH /api/photos/:id
export function useUpdatePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<CreatePhotoRequest>) => {
      const validated = api.photos.update.input.parse(updates);
      const url = buildUrl(api.photos.update.path, { id });
      const res = await fetch(url, {
        method: api.photos.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 404) throw new Error("Photo not found");
        throw new Error("Failed to update photo");
      }
      return api.photos.update.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.photos.list.path, data.areaId] });
      queryClient.invalidateQueries({ queryKey: [api.photos.get.path, data.id] });
    },
  });
}

// DELETE /api/photos/:id
export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.photos.delete.path, { id });
      const res = await fetch(url, { 
        method: api.photos.delete.method, 
        credentials: "include" 
      });
      if (!res.ok) throw new Error("Failed to delete photo");
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

// POST /api/photos/:id/restore-deleted (undo soft delete)
export function useRestoreDeletedPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/photos/${id}/restore-deleted`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to restore deleted photo");
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

// POST /api/photos/bulk-delete (soft delete multiple)
export function useBulkDeletePhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/photos/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete photos");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

// POST /api/photos/bulk-restore (restore multiple)
export function useBulkRestorePhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/photos/bulk-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to restore photos");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
