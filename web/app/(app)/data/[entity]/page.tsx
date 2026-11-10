"use client";

import { notFound } from "next/navigation";
import CrudPage from "@/components/CrudPage";
import { AdminOnly } from "@/components/ProfileProvider";
import { ENTITIES } from "@/lib/entities";

export default function EntityPage({ params }: { params: { entity: string } }) {
  const entity = ENTITIES[params.entity];
  if (!entity) notFound();
  return (
    <AdminOnly>
      <CrudPage key={entity.key} entity={entity} />
    </AdminOnly>
  );
}
