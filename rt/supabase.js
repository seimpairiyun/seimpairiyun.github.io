/* supabase.js */
const SUPABASE_URL = "https://idoskrzggxnnhaohlefq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkb3NrcnpnZ3hubmhhb2hsZWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTI5OTIsImV4cCI6MjA5Nzk2ODk5Mn0.J07f24jpgXXHOuAaGmVAzIhnA5eRiks2m981cinwfbA";

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BUCKET = "checkup-photos";
const MAX_FOTO = 10;

/* ---------------- Helper: upload foto ---------------- */
async function uploadPhoto(dataUrl, areaKey, itemName) {
  if (!dataUrl || !dataUrl.startsWith("data:image/"))
    throw new Error("Bukan data URL gambar");
  const blob = await (await fetch(dataUrl)).blob();
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const safe = `${areaKey}/${itemName.replace(/[^a-z0-9]+/gi, "_")}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(safe, blob, {
    cacheControl: "3600",
    upsert: false,
    contentType: blob.type,
  });
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(safe);
  return { path: safe, url: data.publicUrl };
}

async function deletePhoto(path) {
  if (!path) return;
  await sb.storage.from(BUCKET).remove([path]);
}

/* ---------------- API wrappers ---------------- */
const SB = {
  /* ===== SUPERVISOR ===== */
  async listSupervisors() {
    const { data, error } = await sb
      .from("rt_supervisor")
      .select("*")
      .order("name");
    if (error) throw error;
    return data || [];
  },
  async addSupervisor(name) {
    const { data, error } = await sb
      .from("rt_supervisor")
      .insert({ name })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async renameSupervisor(id, name) {
    const { error } = await sb
      .from("rt_supervisor")
      .update({ name })
      .eq("id", id);
    if (error) throw error;
  },
  async deleteSupervisor(id) {
    const { error } = await sb.from("rt_supervisor").delete().eq("id", id);
    if (error) throw error;
  },

  /* ===== AREA ===== */
  async listAreas() {
    const { data, error } = await sb
      .from("rt_area")
      .select(
        `id,key,label,sort_order,supervisor:supervisor_id ( id,name ), items:rt_item ( id,name,sort_order )`,
      )
      .order("sort_order");
    if (error) throw error;
    return (data || []).map((a) => ({
      id: a.id,
      key: a.key,
      label: a.label,
      supervisor: a.supervisor?.name || "",
      supervisor_id: a.supervisor?.id || null,
      items: (a.items || [])
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((i) => i.name),
    }));
  },
  async setAreaSupervisor(areaId, supervisor_id) {
    const { error } = await sb
      .from("rt_area")
      .update({ supervisor_id })
      .eq("id", areaId);
    if (error) throw error;
  },
  async addAreaItem(areaId, name) {
    const { data, error } = await sb
      .from("rt_item")
      .insert({ area_id: areaId, name, sort_order: Date.now() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async renameAreaItem(itemId, name) {
    const { error } = await sb
      .from("rt_item")
      .update({ name })
      .eq("id", itemId);
    if (error) throw error;
  },
  async deleteAreaItem(itemId) {
    const { error } = await sb.from("rt_item").delete().eq("id", itemId);
    if (error) throw error;
  },

  /* ===== CHECKUP ===== */
  async getCheckupByArea(areaId) {
    const { data: rec, error: e1 } = await sb
      .from("rt_checkup")
      .select(
        `id, area_id, supervisor_id, updated_at, created_at, supervisor:supervisor_id ( name )`,
      )
      .eq("area_id", areaId)
      .maybeSingle();
    if (e1) throw e1;
    if (!rec) return null;

    const { data: items, error: e2 } = await sb
      .from("rt_checkup_item")
      .select(
        `id, item_id, item_name, status, laporan_masalah, tindak_lanjut, keterangan, updated_at,
               photos:rt_checkup_photo ( id, storage_path, sort_order )`,
      )
      .eq("checkup_id", rec.id)
      .order("created_at");
    if (e2) throw e2;

    return {
      id: rec.id,
      area_id: rec.area_id,
      supervisor: rec.supervisor?.name || "",
      updatedAt: rec.updated_at,
      items: (items || []).map((i) => ({
        id: i.id,
        itemId: i.item_id,
        areaBarang: i.item_name,
        status: i.status,
        laporanMasalah: i.laporan_masalah || "",
        tindakLanjut: i.tindak_lanjut || "",
        keterangan: i.keterangan || "",
        photos: (i.photos || [])
          .sort((x, y) => new Date(x.created_at) - new Date(y.created_at))
          .map((p) => ({
            id: p.id,
            path: p.storage_path,
            url: sb.storage.from(BUCKET).getPublicUrl(p.storage_path).data
              .publicUrl,
          })),
      })),
    };
  },

  /* Buat checkup + sync item kalau belum ada */
  async ensureCheckup(areaId, areaLabel, supervisor_id, itemNames) {
    let rec = await this.getCheckupByArea(areaId);
    if (!rec) {
      const { data, error } = await sb
        .from("rt_checkup")
        .insert({ area_id: areaId, supervisor_id })
        .select()
        .single();
      if (error) throw error;
      rec = {
        id: data.id,
        area_id: areaId,
        supervisor: "",
        updatedAt: data.updated_at,
        items: [],
      };
    } else if (rec.supervisor !== (await this._spvName(supervisor_id))) {
      await sb.from("rt_checkup").update({ supervisor_id }).eq("id", rec.id);
    }
    // Sinkron item: pastikan semua itemNames ada di rt_checkup_item
    const existing = new Set(rec.items.map((i) => i.areaBarang));
    const toInsert = itemNames.filter((n) => !existing.has(n));
    if (toInsert.length) {
      const { error } = await sb
        .from("rt_checkup_item")
        .insert(
          toInsert.map((n) => ({
            checkup_id: rec.id,
            item_name: n,
            status: "OK",
          })),
        );
      if (error) throw error;
      rec = await this.getCheckupByArea(areaId);
    }
    return rec;
  },

  async _spvName(id) {
    if (!id) return "";
    const { data } = await sb
      .from("rt_supervisor")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    return data?.name || "";
  },

  /* Simpan perubahan 1 item + foto baru */
  async saveCheckupItem(itemId, payload, newPhotos) {
    // 1) update row
    const { error: e1 } = await sb
      .from("rt_checkup_item")
      .update({
        status: payload.status,
        laporan_masalah: payload.laporanMasalah || "",
        tindak_lanjut: payload.tindakLanjut || "",
        keterangan: payload.keterangan || "",
      })
      .eq("id", itemId);
    if (e1) throw e1;

    // 2) upload foto baru → insert rt_checkup_photo
    const photoRows = [];
    for (const p of newPhotos || []) {
      const up = await uploadPhoto(p.dataUrl, p.areaKey, p.itemName);
      photoRows.push({
        checkup_item_id: itemId,
        storage_path: up.path,
        // sort_order: Date.now() + Math.random(),
      });
    }
    if (photoRows.length) {
      const { error } = await sb.from("rt_checkup_photo").insert(photoRows);
      if (error) throw error;
    }

    // 3) touch updated_at checkup
    // await sb.rpc("rt_touch_checkup", { p_item_id: itemId }).catch(() => {});
  },

  async deleteCheckupPhoto(photoId, storagePath) {
    if (storagePath) await deletePhoto(storagePath);
    const { error } = await sb
      .from("rt_checkup_photo")
      .delete()
      .eq("id", photoId);
    if (error) throw error;
  },
};

window.SB = SB;
window.MAX_FOTO = MAX_FOTO;
