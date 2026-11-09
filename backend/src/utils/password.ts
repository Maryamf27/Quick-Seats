import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(
  inputPassword: string,
  storedHash: string,
): Promise<boolean> {
  return bcrypt.compare(inputPassword, storedHash);
}
