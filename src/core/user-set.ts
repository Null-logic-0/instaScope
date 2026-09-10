import type { User } from "../types";

// Users keyed by username in first-seen order. Usernames are expected to be
// normalized already (profile-link.ts lower-cases them); this class does not
// second-guess identity. The first sighting of a user wins: list rows are
// rendered complete, so a later duplicate carries no new information.
export class UserSet {
  readonly #users = new Map<string, User>();

  // Returns true when the user was not seen before.
  add(user: User): boolean {
    if (this.#users.has(user.username)) return false;
    this.#users.set(user.username, user);
    return true;
  }

  // Returns how many of the given users were new.
  addAll(users: Iterable<User>): number {
    let added = 0;
    for (const user of users) {
      if (this.add(user)) added += 1;
    }
    return added;
  }

  get size(): number {
    return this.#users.size;
  }

  toArray(): User[] {
    return Array.from(this.#users.values());
  }
}
