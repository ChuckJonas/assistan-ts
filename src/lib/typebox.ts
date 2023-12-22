import { Kind, TSchema, Type } from "@sinclair/typebox";

const NULL_TYPES_KINDS: string[] = [
  Type.Void()[Kind],
  Type.Undefined()[Kind],
  Type.Null()[Kind],
];

export const isNullType = (obj: TSchema): boolean => {
  return NULL_TYPES_KINDS.includes(obj[Kind]);
};
