#!/bin/bash

PREFIX=$1
HOSTNAME="$PREFIX.newhive.com"

echo $HOSTNAME > /etc/hostname
hostname $HOSTNAME
echo "Succssefully set hostname to $HOSTNAME"
