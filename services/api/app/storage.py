import io
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from .config import settings


def s3():
    cfg = settings()
    return boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
        region_name="us-east-1",
    )


def initialize_storage():
    cfg = settings()
    if cfg.storage_backend == "s3":
        client = s3()
        try:
            client.head_bucket(Bucket=cfg.s3_bucket)
        except ClientError as exc:
            if str(exc.response["Error"]["Code"]) not in {"404", "NoSuchBucket"}:
                raise
            client.create_bucket(Bucket=cfg.s3_bucket)


def local_path(key):
    root = (Path(settings().data_dir) / "objects").resolve()
    path = (root / key).resolve()
    if not path.is_relative_to(root):
        raise ValueError("Invalid storage key")
    return path


def put(key, data, content_type="application/octet-stream"):
    if settings().storage_backend == "s3":
        s3().put_object(Bucket=settings().s3_bucket, Key=key, Body=data, ContentType=content_type)
    else:
        path = local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def get(key):
    if settings().storage_backend == "s3":
        return s3().get_object(Bucket=settings().s3_bucket, Key=key)["Body"].read()
    return local_path(key).read_bytes()


def open_stream(key):
    if settings().storage_backend == "s3":
        return s3().get_object(Bucket=settings().s3_bucket, Key=key)["Body"]
    return io.BufferedReader(local_path(key).open("rb"))
