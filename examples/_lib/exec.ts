import { exec } from "child_process";

export function exec__unsafe(cmd: string) {
  return new Promise((resolve, reject) => {
    exec(cmd, { env: process.env, shell: "bash" }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      }

      //   if (stderr) {
      //     reject(new Error(stderr));
      //   }

      resolve(stdout);
    });
  });
}
