import bcrypt from "bcryptjs";

const hash = "$2b$12$9w.xDxji.Si89BDiVzsVN.lbiPl219NKB4kltv5Hes2m7Eswu2HIW";
const password = "parool123";

console.log(bcrypt.compareSync(password, hash)); // should print true
