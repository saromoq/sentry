from __future__ import absolute_import, print_function

from django.conf.urls import patterns, url

from .webhooks import GitlabWebhookEndpoint

urlpatterns = patterns(
    '',
    url(r'^webhooks/$', GitlabWebhookEndpoint.as_view()),
)
