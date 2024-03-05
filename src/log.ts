import chalk from "chalk"

const log = (message: string) => {
  console.log(`${chalk.blue("[Soar]")} ${message}`)
}

const error = (message: string) => {
  console.error(`${chalk.red("[Soar]")} ${message}`)
}

export { log, error }
