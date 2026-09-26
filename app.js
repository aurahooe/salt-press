const SUPA_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
let session = null;
let modeSignup = false;

const $ = (id) => document.getElementById(id);

function tick() {
  const now = new Date();
  $("clock").textContent = now.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function go(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.querySelectorAll("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => go(btn.dataset.go));
});

function renderAuth() {
  const slot = $("authSlot");
  if (session?.user) {
    const handle = session.user.user_metadata?.handle || session.user.email.split("@")[0];
    slot.innerHTML = `<span class="kicker" style="margin:0">${handle}</span>
      <button class="ghost" type="button" id="signOut">Sign out</button>`;
    $("signOut").onclick = async () => {
      await sb.auth.signOut();
    };
  } else {
    slot.innerHTML = `<button class="btn" type="button" id="openAuth">Sign in</button>`;
    $("openAuth").onclick = () => openAuth(false);
  }
  renderComposer();
}

function openAuth(signup) {
  modeSignup = signup;
  $("authTitle").textContent = signup ? "Open a desk" : "Sign in";
  $("toggleAuth").textContent = signup ? "Already have an account?" : "Need an account?";
  document.querySelector(".handle-row").hidden = !signup;
  $("authErr").textContent = "";
  $("authModal").hidden = false;
}

$("closeAuth").onclick = () => ($("authModal").hidden = true);
$("toggleAuth").onclick = () => openAuth(!modeSignup);

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = String(fd.get("email")).trim();
  const password = String(fd.get("password"));
  const handle = String(fd.get("handle") || "").trim().toLowerCase();
  $("authErr").textContent = "";
  try {
    if (modeSignup) {
      if (!/^[a-z0-9_]{2,24}$/.test(handle)) throw new Error("Handle: 2–24 letters, numbers, underscore.");
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { handle } },
      });
      if (error) throw error;
      if (data.user) {
        await sb.from("profiles").upsert({
          id: data.user.id,
          handle,
          display_name: handle,
        });
      }
      $("authErr").textContent = data.session ? "Desk opened." : "Check your email if confirmation is on.";
      if (data.session) $("authModal").hidden = true;
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      $("authModal").hidden = true;
    }
  } catch (err) {
    $("authErr").textContent = err.message || "Could not continue.";
  }
});

function renderComposer() {
  const wrap = $("composerWrap");
  if (!session?.user) {
    wrap.innerHTML = `<p class="empty">Sign in to keep a drawer. Public notes still show on the wall.</p>`;
    $("mineList").innerHTML = "";
    return;
  }
  wrap.innerHTML = `
    <form class="composer" id="noteForm">
      <input name="title" maxlength="120" required placeholder="Headline" />
      <textarea name="body" maxlength="8000" required placeholder="The note itself."></textarea>
      <div class="row">
        <label class="check"><input type="checkbox" name="is_public" /> Mark public — it appears on the wall</label>
        <button class="btn" type="submit">Save note</button>
      </div>
      <p class="err" id="noteErr"></p>
    </form>`;
  $("noteForm").onsubmit = saveNote;
}

async function saveNote(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  $("noteErr").textContent = "";
  const payload = {
    user_id: session.user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("is_public") === "on",
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("notes").insert(payload);
  if (error) {
    $("noteErr").textContent = error.message;
    return;
  }
  e.target.reset();
  await Promise.all([loadPublic(), loadMine()]);
}

async function loadHour() {
  const { data } = await sb
    .from("hours")
    .select("slot,headline,editorial")
    .order("slot", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) {
    $("hourHeadline").textContent = "The desk is quiet.";
    $("hourBody").textContent = "A new edition files at the top of every hour.";
    return;
  }
  $("hourHeadline").textContent = data.headline;
  $("hourBody").textContent = data.editorial;
  $("hourMeta").textContent = new Date(data.slot).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
  });
}

function card(note, extra = "") {
  const when = new Date(note.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `<article class="card">
    <h3>${escapeHtml(note.title)}</h3>
    <p>${escapeHtml(note.body)}</p>
    <div class="foot"><span>${when}</span>${note.is_public ? "<span>public</span>" : "<span>private</span>"}${extra}</div>
  </article>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', """);
}

async function loadPublic() {
  const { data } = await sb
    .from("notes")
    .select("id,title,body,is_public,created_at,user_id")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(40);
  const list = data || [];
  $("publicList").innerHTML = list.length
    ? list.map((n) => card(n)).join("")
    : `<p class="empty">Nothing on the wall yet. Write a note and mark it public.</p>`;
}

async function loadMine() {
  if (!session?.user) return;
  const { data } = await sb
    .from("notes")
    .select("id,title,body,is_public,created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });
  const list = data || [];
  $("mineList").innerHTML = list.length
    ? list
        .map(
          (n) =>
            card(
              n,
              `<button class="linkish" data-toggle="${n.id}" data-public="${n.is_public}">${n.is_public ? "Make private" : "Make public"}</button>
               <button class="linkish" data-del="${n.id}">Delete</button>`
            )
        )
        .join("")
    : `<p class="empty">Your drawer is empty.</p>`;

  $("mineList").onclick = async (ev) => {
    const t = ev.target;
    if (t.dataset.toggle) {
      await sb.from("notes").update({ is_public: t.dataset.public !== "true", updated_at: new Date().toISOString() }).eq("id", t.dataset.toggle);
      await Promise.all([loadPublic(), loadMine()]);
    }
    if (t.dataset.del) {
      await sb.from("notes").delete().eq("id", t.dataset.del);
      await Promise.all([loadPublic(), loadMine()]);
    }
  };
}

sb.auth.onAuthStateChange(async (_e, s) => {
  session = s;
  renderAuth();
  await loadMine();
});

tick();
setInterval(tick, 30000);
loadHour();
loadPublic();
sb.auth.getSession().then(({ data }) => {
  session = data.session;
  renderAuth();
  loadMine();
});
