function getProjectId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("projectId");
}

async function loadHeader() {
  const res = await fetch("header.html");
  const html = await res.text();
  document.getElementById("header").innerHTML = html;
}

function initHeader() {
  const user = JSON.parse(localStorage.getItem("user"));
  if (user) {
    document.getElementById("welcome").innerText = "Welcome " + user.name;
  }
}

function logout() {
  localStorage.removeItem("user");
  window.location.href = "login.html";
}