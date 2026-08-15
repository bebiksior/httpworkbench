const jwtSecretValue = Bun.env.JWT_SECRET;

if (jwtSecretValue === undefined || jwtSecretValue === "") {
  throw new Error("JWT_SECRET must be set");
}

if (jwtSecretValue === "your-jwt-secret-here") {
  throw new Error(
    "JWT_SECRET must be changed, you are using the default secret",
  );
}

export const jwtSecret = new TextEncoder().encode(jwtSecretValue);
