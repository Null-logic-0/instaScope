import { $, number, option } from "../dom.js";
import { fail } from "./log.js";

const DATASETS = [
  "followers",
  "following",
  "mutuals",
  "not-following-back",
  "fans",
  "new-followers",
  "lost-followers",
  "snapshot",
];

export const subject = () => $("subject").value || undefined;

const datasetButton = (name) => {
  const button = document.createElement("button");
  button.textContent = `${name}.csv`;
  button.onclick = () => {
    try {
      instaScope.downloadCsv(name, subject());
    } catch (error) {
      fail(error);
    }
  };
  return button;
};

export const refreshData = () => {
  const subjects = instaScope.subjects();
  const previous = $("subject").value;
  $("subject").replaceChildren(...subjects.map(option));
  if (subjects.includes(previous)) $("subject").value = previous;
  if (subjects.length === 0) {
    $("stats").textContent = "No data yet. Import a backup exported from the Instagram tab.";
    $("datasets").replaceChildren();
    return;
  }
  const s = instaScope.stats(subject());
  $("stats").textContent =
    `followers ${number(s.followers)}, following ${number(s.following)}, mutuals ${number(s.mutuals)}, ` +
    `not following back ${number(s.notFollowingBack)}, fans ${number(s.fans)}, ` +
    `new ${number(s.newFollowers)}, lost ${number(s.lostFollowers)}`;
  $("datasets").replaceChildren(...DATASETS.map(datasetButton));
};

const importBackup = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    await instaScope.importJson(file);
    refreshData();
  } catch (error) {
    fail(error);
  }
  event.target.value = "";
};

export function mountData() {
  $("import").onchange = importBackup;
  $("backup").onclick = () => instaScope.downloadJson();
  $("subject").onchange = refreshData;
  refreshData();
}
