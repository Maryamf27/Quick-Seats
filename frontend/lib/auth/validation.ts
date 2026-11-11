export interface LoginFormValues {
  email: string;
  password: string;
}

export interface RegistrationFormValues extends LoginFormValues {
  fullName: string;
  confirmPassword: string;
}

export type LoginFieldErrors = Partial<Record<"email" | "password", string>>;
export type RegistrationFieldErrors = LoginFieldErrors &
  Partial<Record<"fullName" | "confirmPassword", string>>;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateLogin(values: LoginFormValues): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const email = values.email.trim();
  if (!email || email.length > 254 || !isValidEmail(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (!values.password.trim()) {
    errors.password = "Enter your password.";
  }
  return errors;
}

export function validateRegistration(
  values: RegistrationFormValues,
): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {};
  const fullName = values.fullName.trim();
  const email = values.email.trim();
  const password = values.password.trim();

  if (fullName.length < 2 || fullName.length > 120) {
    errors.fullName = "Name must be between 2 and 120 characters.";
  }
  if (!email || email.length > 254 || !isValidEmail(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (password.length < 8 || password.length > 128) {
    errors.password = "Password must be between 8 and 128 characters.";
  } else if (!/[a-z]/.test(password)) {
    errors.password = "Password must contain a lowercase letter.";
  } else if (!/[A-Z]/.test(password)) {
    errors.password = "Password must contain an uppercase letter.";
  } else if (!/[0-9]/.test(password)) {
    errors.password = "Password must contain a number.";
  }
  if (values.confirmPassword.trim() !== password) {
    errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}
