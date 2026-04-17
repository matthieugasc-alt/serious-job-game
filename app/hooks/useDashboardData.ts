"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ─── Shared types for both enterprise & coach dashboards ───────

export interface DashboardOrg {
  id: string;
  name: string;
  type: string;
  status?: string;
  member_count?: number;
  settings?: Record<string, unknown>;
}

export interface DashboardStats {
  total: number;
  assigned: number;
  started: number;
  completed: number;
  mandatoryTotal?: number;
  mandatoryCompleted?: number;
  mandatory_progress?: number;
}

export interface DashboardData {
  orgId: string;
  org: DashboardOrg | null;
  stats: DashboardStats | null;
  memberCount: number;
  loading: boolean;
  error: string;
  token: string | null;
}

/**
 * Shared data-fetching hook for enterprise & coach dashboards.
 *
 * Fetches: org details, assignment stats, member count.
 * Additional fetches (features, capabilities) are left to the page.
 */
export function useDashboardData(paramsPromise: Promise<{ orgId: string }>): DashboardData {
  const router = useRouter();
  const [orgId, setOrgId] = useState("");
  const [org, setOrg] = useState<DashboardOrg | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { orgId: id } = await paramsPromise;
      setOrgId(id);
      const t = localStorage.getItem("auth_token");
      if (!t) {
        router.push("/login");
        return;
      }
      setToken(t);

      try {
        const headers = { Authorization: `Bearer ${t}` };
        const [orgRes, assignRes, membersRes] = await Promise.all([
          fetch(`/api/organizations/${id}`, { headers }),
          fetch(`/api/organizations/${id}/assignments?stats=true`, { headers }),
          fetch(`/api/organizations/${id}/members`, { headers }),
        ]);

        if (orgRes.ok) {
          const d = await orgRes.json();
          setOrg(d.organization || d);
        } else {
          setError("Impossible de charger l'organisation");
        }
        if (assignRes.ok) {
          const d = await assignRes.json();
          setStats(d.stats || d);
        }
        if (membersRes.ok) {
          const d = await membersRes.json();
          setMemberCount(d.members?.length || 0);
        }
      } catch (err) {
        console.error("Dashboard data load failed:", err);
        setError("Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [paramsPromise, router]);

  return { orgId, org, stats, memberCount, loading, error, token };
}
